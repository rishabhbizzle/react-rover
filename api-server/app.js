const express = require('express')
const { generateSlug } = require('random-word-slugs')
const { ECSClient, RunTaskCommand } = require('@aws-sdk/client-ecs')
require('dotenv').config()
const { Server } = require('socket.io')
const Redis = require('ioredis')
const cors = require('cors');
const http = require('http');
const { PrismaClient } = require('@prisma/client')

const app = express()
const PORT = process.env.PORT || 9000
const server = http.createServer(app);
const subscriber = new Redis(process.env.REDIS_URI)
const io = new Server(server, { cors: '*' })
const prisma = new PrismaClient({})



io.on('connection', socket => {
    socket.on('subscribe', channel => {
        socket.join(channel)
        socket.emit('message', `Joined ${channel}`)
    })
})

const ecsClient = new ECSClient({
    region: 'us-east-1',
    credentials: {
        accessKeyId: process.env.ACCESS_KEY_ID,
        secretAccessKey: process.env.ACCESS_KEY_SECRET
    }
})

const config = {
    CLUSTER: 'arn:aws:ecs:us-east-1:381491926504:cluster/build-cluster',
    TASK: 'arn:aws:ecs:us-east-1:381491926504:task-definition/builder-task'
}

app.use(express.json())
app.use(cors())


app.post('/project', async (req, res) => {
    try {
        const { gitURL, domain, type, userId, envVariables } = req.body
        if (!gitURL) return res.status(400).json({ status: 'error', message: 'gitURL is required' })
        if (!type && type !== 'vite' && type !== 'cra') return res.status(400).json({ status: 'error', message: 'Invalid type' })
        const projectSlug = domain ? domain : generateSlug()

        // check if project exists
        const project = await prisma.deployement.findFirst({
            where: {
                projectId: projectSlug
            }
        })

        if (project && project.userId !== userId) return res.status(400).json({ status: 'error', message: 'Project with this Domain already exists. Please use another one' })

        const deployment = await prisma.deployement.create({
            data: {
                projectId: projectSlug,
                gitUrl: gitURL,
                userId
            },
        })

        const command = new RunTaskCommand({
            cluster: config.CLUSTER,
            taskDefinition: config.TASK,
            launchType: 'FARGATE',
            count: 1,
            networkConfiguration: {
                awsvpcConfiguration: {
                    assignPublicIp: 'ENABLED',
                    subnets: ['subnet-0363c9f17bb63fd11', 'subnet-0a7290a8320c7a288', 'subnet-0f4a8e38b58daa037', 'subnet-024499a6ef1a39c53', 'subnet-013a8b2e71ee9f4c7', 'subnet-0ca4537ec5ddc00d1'],
                    securityGroups: ['sg-0cf3de8c7c557360c']
                }
            },
            overrides: {
                containerOverrides: [
                    {
                        name: 'builder-image',
                        environment: [
                            { name: 'GIT_REPOSITORY__URL', value: gitURL },
                            { name: 'PROJECT_ID', value: projectSlug },
                            { name: 'TYPE', value: type },
                            { name: 'DEPLOYMENT_ID', value: deployment.id },
                            { name: 'ENV_VARIABLES', value: JSON.stringify(envVariables)}
                        ]
                    }
                ]
            }
        })

        await ecsClient.send(command);
        return res.json({ status: 'queued', data: { projectSlug, url: `https://${projectSlug}.reactrover.tech` } })
    } catch (error) {
        console.log(error)
        return res.status(500).json({ status: 'error', message: error.message })

    }
})


app.get('/deployments/:userId', async (req, res) => {
    try {
        const { userId } = req.params
        if (!userId) return res.status(400).json({ status: 'error', message: 'userId is required' })

        const deployments = await prisma.deployement.findMany({
            where: {
                userId
            },
            include: {
                Log: {
                    orderBy: {
                        createdAt: 'asc' 
                    }
                }
            },
            orderBy: {
                createdAt: 'desc'
            }
        })
        return res.json({ status: 'success', data: deployments })
    } catch (error) {
        console.log(error)
        return res.status(500).json({ status: 'error', message: error.message })
    }
})

async function initRedisSubscribe() {
    console.log('Subscribed to logs....')
    subscriber.psubscribe('logs:*')
    subscriber.on('pmessage', async (pattern, channel, message) => {
        io.to(channel).emit('message', message)
        const { deploymentId, log: logMessage, type, step } = JSON.parse(message)
        console.log(JSON.parse(message))
        // create a log
        await prisma.log.create({
            data: {
                deployementId: deploymentId,
                logMessage,
                type,
            }
        })
        if (type === 'error') {
            await prisma.deployement.update({
                where: {
                    id: deploymentId
                },
                data: {
                    status: 'FAIL'
                }
            })
        }
        if (logMessage == 'Deployed Successfully...') {
            await prisma.deployement.update({
                where: {
                    id: deploymentId
                },
                data: {
                    status: 'READY'
                }
            })
        }
    })
}


initRedisSubscribe()

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});