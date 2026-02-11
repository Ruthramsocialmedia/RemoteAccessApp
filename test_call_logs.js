// Test Call Logs Feature
const SERVER_URL = 'http://localhost:3000';

async function main() {
    console.log("🔍 Testing Call Logs Feature...\n");

    try {
        // 1. Get online devices
        const devicesRes = await fetch(`${SERVER_URL}/api/devices/online`);
        const devicesData = await devicesRes.json();

        if (!devicesData.success || devicesData.devices.length === 0) {
            console.log("❌ No online devices found!");
            process.exit(1);
        }

        const deviceId = devicesData.devices[0].deviceId;
        console.log(`✅ Device: ${deviceId}\n`);

        // 2. Test call_logs command
        console.log("📋 Testing call_logs (limit: 10)...");
        const logsRes = await sendCommand(deviceId, 'call_logs', { limit: 10 });

        if (logsRes.success && logsRes.data.status === 'success') {
            console.log(`✅ Retrieved ${logsRes.data.count} call logs`);
            if (logsRes.data.data && logsRes.data.data.length > 0) {
                console.log("\nSample log:");
                const sample = logsRes.data.data[0];
                console.log(`  Number: ${sample.number}`);
                console.log(`  Type: ${sample.type}`);
                console.log(`  Date: ${sample.date}`);
                console.log(`  Duration: ${sample.duration}s`);
            }
        } else {
            console.log(`❌ Failed: ${logsRes.data?.error || logsRes.error}`);
        }

        // 3. Test call_logs_export (CSV)
        console.log("\n📥 Testing call_logs_export (CSV)...");
        const exportRes = await sendCommand(deviceId, 'call_logs_export', { format: 'csv' });

        if (exportRes.success && exportRes.data.status === 'success') {
            console.log(`✅ Exported ${exportRes.data.count} logs to:`);
            console.log(`   ${exportRes.data.path}`);
            console.log(`   Format: ${exportRes.data.format}`);
        } else {
            console.log(`❌ Failed: ${exportRes.data?.error || exportRes.error}`);
        }

        console.log("\n✅ Call Logs Feature Test Complete!");

    } catch (error) {
        console.error("❌ Error:", error.message);
        process.exit(1);
    }
}

async function sendCommand(deviceId, action, payload = {}) {
    try {
        const response = await fetch(`${SERVER_URL}/api/command/${deviceId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ action, payload })
        });

        return await response.json();
    } catch (error) {
        return { success: false, error: error.message };
    }
}

main();
