const express = require('express');
const router = express.Router();
const socketRegistry = require('../services/socketRegistry');
const commandDispatcher = require('../services/commandDispatcher');

// Get all connected devices
router.get('/devices', (req, res) => {
    res.json(socketRegistry.getAllClients());
});

// Get specific device info
router.get('/devices/:id', (req, res) => {
    const client = socketRegistry.getClient(req.params.id);
    if (!client) return res.status(404).json({ error: 'Device not found' });
    res.json({ id: req.params.id, ...client.info });
});

// Send command to device
router.post('/command', (req, res) => {
    const { deviceId, action, payload } = req.body;
    const result = commandDispatcher.sendCommand(deviceId, action, payload);
    if (!result.success) return res.status(404).json(result);
    res.json(result);
});

// Broadcast command to all devices
router.post('/broadcast', (req, res) => {
    const { action, payload } = req.body;
    const results = commandDispatcher.broadcastCommand(action, payload);
    res.json({ results });
});

module.exports = router;
