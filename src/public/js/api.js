// Shared API Helpers
const API_BASE = '/api';

async function fetchDevices() {
    const res = await fetch(`${API_BASE}/devices`);
    return res.json();
}

async function sendCommand(deviceId, action, payload = {}) {
    const res = await fetch(`${API_BASE}/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId, action, payload })
    });
    return res.json();
}

function getDeviceIdFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get('id');
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function log(msg, el = document.getElementById('log')) {
    if (!el) return;
    const time = new Date().toLocaleTimeString();
    el.innerHTML += `<div>[${time}] ${msg}</div>`;
    el.scrollTop = el.scrollHeight;
}
