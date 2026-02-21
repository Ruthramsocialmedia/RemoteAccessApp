// Remote Access Call Test Script
// Uses HTTP API to control device

const SERVER_URL = 'http://localhost:3000';
const TEST_NUMBER = '9361339871';

async function main() {
    console.log("🔍 Looking for online devices...");

    try {
        // 1. Get online devices
        const devicesRes = await fetch(`${SERVER_URL}/api/devices/online`);
        const devicesData = await devicesRes.json();

        if (!devicesData.success || devicesData.devices.length === 0) {
            console.log("\n❌ No online devices found!");
            console.log("   Please ensure the app is open on your phone.");
            process.exit(1);
        }

        const device = devicesData.devices[0];
        const deviceId = device.deviceId;
        console.log(`✅ Found device: ${deviceId} (${device.metadata?.model || 'Unknown Model'})`);

        // 2. Perform Call Test
        await performCallTest(deviceId);

    } catch (error) {
        console.error("❌ Error:", error.message);
        process.exit(1);
    }
}

async function performCallTest(deviceId) {
    console.log(`\n📞 Dialing ${TEST_NUMBER}...`);

    const dialRes = await sendCommand(deviceId, 'call_dial', { number: TEST_NUMBER });
    if (dialRes.success) {
        console.log("   Dial command sent successfully.");
    } else {
        console.error("   Failed to send dial command:", dialRes.error);
        return;
    }

    console.log("⏳ Waiting 15 seconds for call to establish...");

    // Wait 15 seconds
    await new Promise(resolve => setTimeout(resolve, 15000));

    console.log("\n⛔ Ending call...");

    const endRes = await sendCommand(deviceId, 'call_end');
    if (endRes.success) {
        console.log("   End call command sent successfully.");
        console.log("✅ TEST COMPLETE. Please verify the call ended on the phone.");
    } else {
        console.error("   Failed to send end call command:", endRes.error);
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
