/**
 * Socket Registry - Manages active device WebSocket connections
 */

class SocketRegistry {
    constructor() {
        // Map of deviceId -> { ws, metadata }
        this.devices = new Map();
    }

    /**
     * Register a new device connection
     * Closes old socket if device already registered (handles reconnects)
     */
    register(deviceId, ws, metadata = {}) {
        // Check if device already registered
        const existing = this.devices.get(deviceId);
        if (existing) {
            console.log(`[Registry] Device ${deviceId} already registered - closing old socket`);

            // Close old socket to prevent ghost connections
            try {
                if (existing.ws && existing.ws.readyState === existing.ws.OPEN) {
                    existing.ws.close(1000, 'Replaced by new connection');
                }
            } catch (e) {
                console.error(`[Registry] Error closing old socket: ${e.message}`);
            }
        }

        // Register new connection
        this.devices.set(deviceId, {
            ws,
            metadata: {
                ...metadata,
                status: 'online',
                connectedAt: new Date().toISOString(),
                lastSeen: new Date().toISOString(),
            },
        });
        console.log(`[Registry] Device registered: ${deviceId}`);
        console.log(`[Registry] Total devices: ${this.devices.size}`);
    }

    /**
     * Mark device as offline (don't delete - keep history)
     */
    markOffline(deviceId) {
        const device = this.devices.get(deviceId);
        if (device) {
            device.metadata.status = 'offline';
            device.metadata.lastSeen = new Date().toISOString();
            device.ws = null; // Remove socket reference

            console.log(`[Registry] Device marked offline: ${deviceId}`);
        }
    }

    /**
     * Permanently delete a device (admin action only)
     */
    deleteDevice(deviceId) {
        const removed = this.devices.delete(deviceId);
        if (removed) {
            console.log(`[Registry] Device permanently deleted: ${deviceId}`);
        }
        return removed;
    }

    /**
     * Get a specific device connection
     */
    getDevice(deviceId) {
        return this.devices.get(deviceId);
    }

    /**
     * Update device metadata
     */
    updateMetadata(deviceId, metadata) {
        const device = this.devices.get(deviceId);
        if (device) {
            device.metadata = {
                ...device.metadata,
                ...metadata,
                lastSeen: new Date().toISOString(),
            };
        }
    }

    /**
     * List all connected devices
     */
    listDevices() {
        const deviceList = [];
        for (const [deviceId, device] of this.devices.entries()) {
            deviceList.push({
                deviceId,
                ...device.metadata,
            });
        }
        return deviceList;
    }

    /**
     * Check if device is online
     */
    isOnline(deviceId) {
        const device = this.devices.get(deviceId);
        return device && device.metadata.status === 'online';
    }

    /**
     * Get only online devices
     */
    getOnlineDevices() {
        const onlineDevices = [];
        for (const [deviceId, device] of this.devices.entries()) {
            if (device.metadata.status === 'online') {
                onlineDevices.push({
                    deviceId,
                    ...device.metadata,
                });
            }
        }
        return onlineDevices;
    }

    /**
     * Get device count
     */
    getDeviceCount() {
        return this.devices.size;
    }
}

// Singleton instance
export const socketRegistry = new SocketRegistry();
export default socketRegistry;
