// Test script to dial a number using the Remote Access App
const SERVER_URL = 'http://localhost:3000';
const DEVICE_ID = '0004593a-3fc6-4d0f-bcf5-ec2b450b98c4';

async function testDialer(number) {
    console.log(`\n📞 Testing Call Dialer - Dialing ${number}...\n`);

    try {
        // Send dial command
        const response = await fetch(`${SERVER_URL}/api/command/${DEVICE_ID}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'call_dial',
                payload: { number }
            })
        });

        const result = await response.json();

        if (result.success) {
            console.log('✅ Call initiated successfully!');
            console.log(`   Number: ${number}`);
            console.log(`   Status: ${result.data.status}`);
            console.log(`   Message: ${result.data.message}`);
        } else {
            console.log('❌ Failed to dial:');
            console.log(`   Error: ${result.error || result.data?.error}`);
        }

        // Wait a moment, then check call state
        console.log('\n⏳ Waiting 2 seconds...\n');
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Get call state
        const stateResponse = await fetch(`${SERVER_URL}/api/command/${DEVICE_ID}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'call_state'
            })
        });

        const stateResult = await stateResponse.json();

        if (stateResult.success) {
            console.log('📊 Call State:');
            console.log(`   Current state: ${stateResult.data.state}`);
        }

        console.log('\n✅ Call Dialer Test Complete!\n');

    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

// Test with number 121
testDialer('121');
