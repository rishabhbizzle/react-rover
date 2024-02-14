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
const type = process.env.TYPE || 'vite'

function publishLog(log, type, step) {
    publisher.publish(`logs:${PROJECT_ID}`, JSON.stringify({ log, type, step }))
}

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB limit

async function init() {
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
                console.error('Build failed with exit code', code);
                publishLog(`Build failed with exit code ${code}`, "error", "build");
                throw new Error(`Build failed with exit code ${code}`);
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
                        throw new Error(`File ${file} exceeds size limit`);
                    }

                    console.log('uploading', filePath);
                    publishLog(`Uploading ${file}...`, "success", "deploy");

                    const command = new PutObjectCommand({
                        Bucket: 'vercel-deployments',
                        Key: `__outputs/${PROJECT_ID}/${file}`,
                        Body: fs.createReadStream(filePath),
                        ContentType: mime.lookup(filePath)
                    });

                    try {
                        await s3Client.send(command);
                        console.log('uploaded', filePath);
                    } catch (error) {
                        console.error('Error uploading file:', error);
                        publishLog(`Error uploading file ${file}: ${error.message}`, "error", "deploy");
                        throw error; // Re-throw error to propagate to the main try-catch block
                    }
                }
                publishLog(`Deployed Successfully...`, "success", "deploy");
                console.log('Done...');
            } catch (error) {
                console.error('Deployment error:', error);
                publishLog(`Deployment error: ${error.message}`, "error", "deploy");
                throw error; // Re-throw error to propagate to the main try-catch block
            }
            publishLog(`Your Project is Live... 🎉`, "success", "deploy");
            publisher.disconnect();
        });

}


init()