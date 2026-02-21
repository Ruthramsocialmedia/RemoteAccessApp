import fetch from 'node-fetch';

const SERVER_URL = 'http://localhost:3000';

async function stopMic() {
    try {
        // Get connected devices
        const devicesRes = await fetch(`${SERVER_URL}/api/devices`);
        const devices = await devicesRes.json();

        console.log('Connected devices:', devices);

        if (devices.length === 0) {
            console.log('❌ No devices connected');
            return;
        }

        const deviceId = devices[0].id;
        console.log(`\n🛑 Stopping mic on device: ${deviceId}`);

        // Send mic_stop command
        const response = await fetch(`${SERVER_URL}/api/command`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                deviceId: deviceId,
                action: 'mic_stop'
            })
        });

        const result = await response.json();
        console.log('\nResult:', JSON.stringify(result, null, 2));

        if (result.success) {
            console.log('✅ Mic stopped successfully');
        } else {
            console.log('❌ Failed to stop mic:', result.error);
        }
    } catch (error) {
        console.error('Error:', error.message);
    }
}

stopMic();
