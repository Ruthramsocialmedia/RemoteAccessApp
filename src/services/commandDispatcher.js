const socketRegistry = require('./socketRegistry');

class CommandDispatcher {
    sendCommand(deviceId, action, payload = {}) {
        const client = socketRegistry.getClient(deviceId);
        if (!client || client.ws.readyState !== 1) {
            return { success: false, error: 'Device offline' };
        }

        const command = {
            id: `cmd_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
            action,
            payload
        };

        client.ws.send(JSON.stringify(command));
        return { success: true, commandId: command.id };
    }

    broadcastCommand(action, payload = {}) {
        const results = [];
        for (const [deviceId] of socketRegistry.clients) {
            results.push({ deviceId, ...this.sendCommand(deviceId, action, payload) });
        }
        return results;
    }
}

module.exports = new CommandDispatcher();
