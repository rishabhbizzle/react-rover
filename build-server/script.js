require('dotenv').config()
const { exec } = require('child_process')
const path = require('path')
const fs = require('fs')
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3')
const mime = require('mime-types')
const Redis = require('ioredis')


const publisher = new Redis(process.env.REDIS_URI)
const s3Client = new S3Client({
    region: 'ap-south-1',
    credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID,
        secretAccessKey: process.env.S3_ACCESS_KEY_SECRET
    }
})
const PROJECT_ID = process.env.PROJECT_ID
const type = process.env.TYPE
const DEPLOYMENT_ID = process.env.DEPLOYMENT_ID

function publishLog(log, type, step) {
    publisher.publish(`logs:${PROJECT_ID}`, JSON.stringify({ log, type, step, projectId: PROJECT_ID, deploymentId: DEPLOYMENT_ID }))
}

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB limit

async function init() {
    return new Promise((resolve, reject) => {
        console.log('Executing script.js');
        publishLog('Build Started... 👷‍♂️', "success", "build");
        const outDirPath = path.join(__dirname, 'output');

        const p = exec(`cd ${outDirPath} && npm install && npm run build`);

        p.stdout.on('data', function (data) {
            console.log(data.toString());
            publishLog(data.toString(), "success", "build");
        });

        p.stderr.on('data', function (data) {
            console.error('Error:', data.toString());
            publishLog(data.toString(), "error", "build");
        });

        p.on('close', async function (code) {
            if (code !== 0) {
                publishLog(`Build failed with exit code ${code}`, "error", "build");
                console.log('Build failed with exit code', code);
                reject(new Error(`Build failed with exit code ${code}`));
                return; // Exit the function early
            }

            console.log('Build Complete');
            publishLog(`Build Complete...`, "success", "build");
            try {
                const distFolderPath = path.join(__dirname, 'output', type === "cra" ? 'build' : 'dist');
                const distFolderContents = fs.readdirSync(distFolderPath, { recursive: true });
                publishLog(`Deploying Project...`, "success", "deploy");
                for (const file of distFolderContents) {
                    console.log('Uploading', file);
                    const filePath = path.join(distFolderPath, file);
                    if (fs.lstatSync(filePath).isDirectory()) continue;

                    const fileSize = fs.statSync(filePath).size;
                    if (fileSize > MAX_FILE_SIZE_BYTES) {
                        console.error(`File ${file} exceeds size limit`);
                        publishLog(`File ${file} exceeds size limit`, "error", "deploy");
                        reject(new Error(`File ${file} exceeds size limit`));
                        return; // Exit the function early
                    }

                    console.log('uploading', filePath);
                    publishLog(`Uploading ${file}...`, "success", "deploy");

                    const command = new PutObjectCommand({
                        Bucket: 'vercel-deployments',
                        Key: `__outputs/${PROJECT_ID}/${file}`,
                        Body: fs.createReadStream(filePath),
                        ContentType: mime.lookup(filePath)
                    });

                        await s3Client.send(command);
                        console.log('uploaded', filePath);
                }
                publishLog(`Deployed Successfully...`, "success", "deploy");
                console.log('Done...');
                resolve(); // Resolve the promise when all operations are complete
            } catch (error) {
                console.log('Deployment error:', error);
                reject(error); // Reject with the error
            }
        });
    });
}


init()
    .then(() => {
        console.log('Done!!!!');
        publishLog(`Your Project is now live...🎉`, "success", "deploy");
        setTimeout(() => {
            process.exit(0);
        }, 5000);
    })
    .catch((error) => {
        publishLog(`Error: ${error.message}`, "error", "deploy");
        console.error('Error:', error);
        setTimeout(() => {
            process.exit(0);
        }, 5000);
    });
  
