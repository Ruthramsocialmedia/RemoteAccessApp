// Stop mic stream
const SERVER_URL = 'http://localhost:3000';
const DEVICE_ID = '0004593a-3fc6-4d0f-bcf5-ec2b450b98c4';

async function stopMic() {
    console.log('\n🛑 Stopping mic stream...\n');

    try {
        const response = await fetch(`${SERVER_URL}/api/command/${DEVICE_ID}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'mic_stop'
            })
        });

        const result = await response.json();
        console.log('Result:', JSON.stringify(result, null, 2));

        if (result.success) {
            console.log('✅ Mic stream stopped successfully');
        } else {
            console.log('❌ Failed to stop mic');
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

stopMic();
