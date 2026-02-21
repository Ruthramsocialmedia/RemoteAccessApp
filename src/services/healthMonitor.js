/**
 * Health Monitor - Detects dead/timed-out device connections
 * 
 * BEST WORKING PLAN:
 * - Check device health every 30 seconds
 * - Mark devices OFFLINE if no heartbeat for 90 seconds
 * - Force disconnect dead connections
 */

class HealthMonitor {
    constructor(socketRegistry) {
        this.registry = socketRegistry;
        this.CHECK_INTERVAL = 30000; // Check every 30s
        this.TIMEOUT_MS = 90000; // 90s timeout (BEST WORKING PLAN)
        this.monitorInterval = null;
    }

    /**
     * Start health monitoring
     */
    start() {
        console.log('[HealthMonitor] Starting health monitor...');
        console.log(`[HealthMonitor] Check interval: ${this.CHECK_INTERVAL}ms`);
        console.log(`[HealthMonitor] Timeout threshold: ${this.TIMEOUT_MS}ms`);

        this.monitorInterval = setInterval(() => {
            this.checkDeviceHealth();
        }, this.CHECK_INTERVAL);
    }

    /**
     * Stop health monitoring
     */
    stop() {
        if (this.monitorInterval) {
            clearInterval(this.monitorInterval);
            this.monitorInterval = null;
            console.log('[HealthMonitor] Health monitor stopped');
        }
    }

    /**
     * Check all devices for timeout
     */
    checkDeviceHealth() {
        const now = Date.now();
        const devices = this.registry.listDevices();
        let deadCount = 0;

        for (const device of devices) {
            // Use lastHeartbeat if available, otherwise lastSeen
            const lastHeartbeat = device.lastHeartbeat || device.lastSeen;
            if (!lastHeartbeat) continue;

            const lastHeartbeatTime = new Date(lastHeartbeat).getTime();
            const elapsed = now - lastHeartbeatTime;

            // Check if device timed out
            if (elapsed > this.TIMEOUT_MS) {
                console.log(`[HealthMonitor] ⚠️ Device ${device.deviceId} timed out`);
                console.log(`[HealthMonitor]    Last heartbeat: ${elapsed}ms ago`);
                console.log(`[HealthMonitor]    Threshold: ${this.TIMEOUT_MS}ms`);

                // Force disconnect
                const deviceConn = this.registry.getDevice(device.deviceId);
                if (deviceConn && deviceConn.ws) {
                    try {
                        deviceConn.ws.close(1001, 'Heartbeat timeout');
                    } catch (e) {
                        console.error(`[HealthMonitor] Error closing socket: ${e.message}`);
                    }
                }

                // Remove from registry entirely
                this.registry.deleteDevice(device.deviceId);
                deadCount++;
            }
        }

        // Log summary
        if (deadCount > 0) {
            console.log(`[HealthMonitor] Cleaned up ${deadCount} dead connection(s)`);
        }

        if (devices.length > 0) {
            console.log(`[HealthMonitor] Active devices: ${devices.length - deadCount}`);
        }
    }

    /**
     * Get device health status
     */
    getDeviceStatus(deviceId) {
        const device = this.registry.getDevice(deviceId);
        if (!device) {
            return { status: 'offline', reason: 'not_registered' };
        }

        const lastHeartbeat = device.metadata.lastHeartbeat || device.metadata.lastSeen;
        if (!lastHeartbeat) {
            return { status: 'unknown', reason: 'no_heartbeat_data' };
        }

        const now = Date.now();
        const lastHeartbeatTime = new Date(lastHeartbeat).getTime();
        const elapsed = now - lastHeartbeatTime;

        if (elapsed > this.TIMEOUT_MS) {
            return {
                status: 'offline',
                reason: 'timeout',
                lastHeartbeat: lastHeartbeat,
                elapsed: elapsed,
            };
        }

        return {
            status: 'online',
            lastHeartbeat: lastHeartbeat,
            elapsed: elapsed,
        };
    }
}

export default HealthMonitor;
