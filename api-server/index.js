const express = require('express')
const { generateSlug } = require('random-word-slugs')
const { ECSClient, RunTaskCommand } = require('@aws-sdk/client-ecs')
const { default: mongoose } = require('mongoose')
require('dotenv').config()
const { Server } = require('socket.io')
const Redis = require('ioredis')
const cors = require('cors');


const app = express()
const PORT = 9000

const subscriber = new Redis(process.env.REDIS_URI)

const io = new Server({ cors: '*' })

io.on('connection', socket => {
    socket.on('subscribe', channel => {
        socket.join(channel)
        socket.emit('message', `Joined ${channel}`)
    })
})

io.listen(9002, () => console.log('Socket Server 9002'))

// mongoose.connect(process.env.MONGO_URI)
// .then(() => console.log('Connected to MongoDB'))
// .catch(err => console.log(err))

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
    const { gitURL, slug, type } = req.body

    if (!gitURL) return res.status(400).json({ status: 'error', message: 'gitURL is required' })
    if (!type && type !== 'vite' && type !== 'cra') return res.status(400).json({ status: 'error', message: 'Invalid type' })

    console.log(gitURL, slug)
    const projectSlug = slug ? slug : generateSlug()

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
                        { name: 'TYPE', value: type ? type : 'vite'}
                    ]
                }
            ]
        }
    })

    await ecsClient.send(command);
    return res.json({ status: 'queued', data: { projectSlug, url: `http://${projectSlug}.vercel-clone-env.eba-rcwzsec3.ap-south-1.elasticbeanstalk.com` } })
})

async function initRedisSubscribe() {
    console.log('Subscribed to logs....')
    subscriber.psubscribe('logs:*')
    subscriber.on('pmessage', (pattern, channel, message) => {
        io.to(channel).emit('message', message)
    })
}


initRedisSubscribe()

app.listen(PORT, () => console.log(`API Server Running..${PORT}`))