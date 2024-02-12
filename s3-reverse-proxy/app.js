require('dotenv').config()
const express = require('express')
const httpProxy = require('http-proxy')
const app = express()
const PORT = process.env.PORT
const BASE_PATH = process.env.BASE_PATH

const proxy = httpProxy.createProxy()
app.use((req, res) => {
    const hostname = req.hostname;
    const subdomain = hostname.split('.')[0];

    const requestedUrl = req.url;
    const hasExtension = requestedUrl.includes('.') || requestedUrl.endsWith('/');

    if (!hasExtension) {
        // Redirect subpages to the root page
        return res.redirect('/');
    }
    const resolvesTo = `${BASE_PATH}/${subdomain}`

    return proxy.web(req, res, { target: resolvesTo, changeOrigin: true })

})

// this makes sure that the index.html is served when the root path is hit
proxy.on('proxyReq', (proxyReq, req, res) => {
    const url = req.url;
    if (url === '/')
        proxyReq.path += 'index.html'

})

app.listen(PORT, () => console.log(`Reverse Proxy Running..${PORT}`))