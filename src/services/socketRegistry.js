
const WebSocket = require('ws');

class SocketRegistry {
    constructor() {
        this.clients = new Map(); // DeviceID -> WebSocket
    }

    register(ws, deviceId, deviceInfo) {
        this.clients.set(deviceId, { ws, info: deviceInfo });
        console.log(`[Registry] Device Connected: ${deviceId}`);
    }

    remove(ws) {
        for (const [deviceId, client] of this.clients.entries()) {
            if (client.ws === ws) {
                this.clients.delete(deviceId);
                console.log(`[Registry] Device Disconnected: ${deviceId}`);
                return deviceId;
            }
        }
        return null;
    }

    getClient(deviceId) {
        return this.clients.get(deviceId);
    }

    getAllClients() {
        const list = [];
        for (const [id, client] of this.clients.entries()) {
            list.push({ id, ...client.info });
        }
        return list;
    }

    broadcast(message) {
        for (const client of this.clients.values()) {
            if (client.ws.readyState === WebSocket.OPEN) {
                client.ws.send(JSON.stringify(message));
            }
        }
    }
}

module.exports = new SocketRegistry();
