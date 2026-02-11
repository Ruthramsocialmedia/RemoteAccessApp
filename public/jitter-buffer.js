// Real-Time Jitter Buffer Implementation for mic-stream.html
// Replace the existing playAudioChunk and playNextChunk functions with this code

// ========== CONSTANTS ==========
const SAMPLE_RATE = 16000;
const FRAME_MS = 10;
const TARGET_LATENCY = 120; // ms

// ========== STATE VARIABLES ==========
let jitterBuffer = []; // Time-based buffer (not FIFO)
let startTime = null;  // AudioContext playback clock
let schedulerInterval = null;

// ========== HELPER FUNCTIONS ==========

// Convert base64 PCM to Float32Array
function base64ToFloat32(base64) {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }

    const pcm16 = new Int16Array(bytes.buffer);
    const float32 = new Float32Array(pcm16.length);
    for (let i = 0; i < pcm16.length; i++) {
        float32[i] = pcm16[i] / 32768.0;
    }
    return float32;
}

// ========== AUDIO HANDLING ==========

// Handle incoming audio frame (timestamped)
function playAudioChunk(frameJson) {
    try {
        // Parse JSON frame: {"ts": 123456, "pcm": "base64..."}
        const frame = JSON.parse(frameJson);

        // Add to jitter buffer
        jitterBuffer.push(frame);

        // Drop old packets (>300ms old)
        const now = performance.now();
        jitterBuffer = jitterBuffer.filter(p => now - p.ts < 300);

        // Update visualizer
        updateVisualizer(`🎵 Receiving audio... (${jitterBuffer.length} buffered)`);
    } catch (error) {
        console.error('Error handling audio frame:', error);
    }
}

// Time-based audio scheduler (WebRTC-style)
function schedulePlayback() {
    if (!audioContext || jitterBuffer.length === 0) return;

    // Initialize start time with target latency
    if (!startTime) {
        startTime = audioContext.currentTime + (TARGET_LATENCY / 1000);
    }

    // Schedule all buffered frames
    while (jitterBuffer.length > 0) {
        const frame = jitterBuffer.shift();
        const pcmFloat32 = base64ToFloat32(frame.pcm);

        // Create audio buffer
        const buffer = audioContext.createBuffer(1, pcmFloat32.length, SAMPLE_RATE);
        buffer.copyToChannel(pcmFloat32, 0);

        // Create and schedule source
        const source = audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(audioContext.destination);
        source.start(startTime);

        // Advance playback clock
        startTime += FRAME_MS / 1000;
    }
}

// ========== INTEGRATION ==========

// Start the scheduler when starting live stream
// Add this to your startLive() function:
//   schedulerInterval = setInterval(schedulePlayback, 20);

// Stop the scheduler when stopping live stream
// Add this to your stopLive() function:
//   if (schedulerInterval) {
//       clearInterval(schedulerInterval);
//       schedulerInterval = null;
//   }
//   jitterBuffer = [];
//   startTime = null;
