/**
 * Command Dispatcher - Routes JSON commands to devices and handles responses
 */

import { socketRegistry } from './socketRegistry.js';

class CommandDispatcher {
    constructor() {
        // Map of commandId -> { resolve, reject, timeout }
        this.pendingCommands = new Map();
        this.commandIdCounter = 0;
    }

    /**
     * Generate unique command ID
     */
    generateCommandId() {
        return `cmd_${Date.now()}_${++this.commandIdCounter}`;
    }

    /**
     * Send a command to a device and wait for response
     * @param {string} deviceId - Target device ID
     * @param {string} action - Command action
     * @param {object} payload - Command payload
     * @param {number} timeout - Timeout in milliseconds (default: 30000)
     * @returns {Promise} Response data
     */
    sendCommand(deviceId, action, payload = {}, timeout = 30000) {
        return new Promise((resolve, reject) => {
            const device = socketRegistry.getDevice(deviceId);

            if (!device) {
                reject(new Error(`Device ${deviceId} not found`));
                return;
            }

            // Check if WebSocket is actually connected
            if (!device.ws || device.ws.readyState !== 1) {
                reject(new Error(`Device ${deviceId} is offline`));
                return;
            }

            const commandId = this.generateCommandId();
            const command = {
                id: commandId,
                action,
                payload,
            };

            // Set up timeout
            const timeoutHandle = setTimeout(() => {
                this.pendingCommands.delete(commandId);
                reject(new Error(`Command ${commandId} timed out after ${timeout}ms`));
            }, timeout);

            // Store pending command
            this.pendingCommands.set(commandId, {
                resolve,
                reject,
                timeout: timeoutHandle,
                deviceId,
                action,
                sentAt: Date.now(),
            });

            // Send command
            try {
                device.ws.send(JSON.stringify(command));
                console.log(`[Dispatcher] Command sent: ${commandId} -> ${deviceId} (${action})`);
            } catch (error) {
                clearTimeout(timeoutHandle);
                this.pendingCommands.delete(commandId);
                reject(error);
            }
        });
    }

    /**
     * Handle response from device
     * @param {object} response - Response from device
     */
    handleResponse(response) {
        const { replyTo, status, data, error } = response;

        if (!replyTo) {
            console.warn('[Dispatcher] Received response without replyTo field');
            return;
        }

        const pending = this.pendingCommands.get(replyTo);
        if (!pending) {
            console.warn(`[Dispatcher] Received response for unknown command: ${replyTo}`);
            return;
        }

        // Clean up
        clearTimeout(pending.timeout);
        this.pendingCommands.delete(replyTo);

        const duration = Date.now() - pending.sentAt;
        console.log(`[Dispatcher] Response received: ${replyTo} (${duration}ms) - ${status}`);

        // Resolve or reject based on status
        if (status === 'success') {
            pending.resolve(data);
        } else {
            pending.reject(new Error(error || 'Command failed'));
        }
    }

    /**
     * Get pending commands count
     */
    getPendingCount() {
        return this.pendingCommands.size;
    }

    /**
     * Clear all pending commands for a device (on disconnect)
     */
    clearDeviceCommands(deviceId) {
        let cleared = 0;
        for (const [commandId, pending] of this.pendingCommands.entries()) {
            if (pending.deviceId === deviceId) {
                clearTimeout(pending.timeout);
                pending.reject(new Error(`Device ${deviceId} disconnected`));
                this.pendingCommands.delete(commandId);
                cleared++;
            }
        }
        if (cleared > 0) {
            console.log(`[Dispatcher] Cleared ${cleared} pending commands for ${deviceId}`);
        }
    }
}

// Singleton instance
export const commandDispatcher = new CommandDispatcher();
export default commandDispatcher;
