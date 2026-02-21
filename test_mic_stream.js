// Test script for microphone streaming
const SERVER_URL = 'http://localhost:3000';
const DEVICE_ID = '0004593a-3fc6-4d0f-bcf5-ec2b450b98c4';

async function testMicStream() {
    console.log('\n🎙️ Testing Microphone Stream...\n');

    try {
        // Start mic stream
        console.log('Starting mic stream...');
        const startResponse = await fetch(`${SERVER_URL}/api/command/${DEVICE_ID}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'mic_start'
            })
        });

        const startResult = await startResponse.json();
        console.log('Start result:', JSON.stringify(startResult, null, 2));

        if (startResult.success) {
            console.log('✅ Mic stream started successfully');

            // Wait 5 seconds
            console.log('\n⏳ Waiting 5 seconds for audio chunks...\n');
            await new Promise(resolve => setTimeout(resolve, 5000));

            // Stop mic stream
            console.log('Stopping mic stream...');
            const stopResponse = await fetch(`${SERVER_URL}/api/command/${DEVICE_ID}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'mic_stop'
                })
            });

            const stopResult = await stopResponse.json();
            console.log('Stop result:', JSON.stringify(stopResult, null, 2));

            if (stopResult.success) {
                console.log('✅ Mic stream stopped successfully');
            }
        } else {
            console.log('❌ Failed to start mic stream');
            console.log('Error:', startResult.error || startResult.data?.error);
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

testMicStream();
