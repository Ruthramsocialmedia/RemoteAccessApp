# Remote Access Server Gateway

WebSocket-based server for managing Android devices remotely.

## Features
- WebSocket server for persistent device connections
- Command dispatcher with promise-based routing
- Admin dashboard with 8+ control pages
- File upload/download support
- Device management and monitoring

## Installation

```bash
npm install
```

## Development

```bash
npm run dev
```

Server will start on `http://localhost:3000`

## Production

```bash
npm start
```

## Environment Variables

Create a `.env` file:
```
PORT=3000
NODE_ENV=development
SECRET_KEY=your-secret-key
```

## Deployment to Render

1. Push code to GitHub repository
2. Create new Web Service on Render
3. Connect repository
4. Render will automatically detect and use `render.yaml`
5. Set environment variables in Render dashboard

## Admin Dashboard Pages

- `/` - Device list and dashboard
- `/device-info.html` - Device information and stats
- `/file-manager.html` - Browse and manage files
- `/screen-stream.html` - Screen sharing view
- `/cam-stream.html` - Camera control
- `/mic-stream.html` - Microphone control
- `/control.html` - Accessibility controls (tap, swipe, input)
- `/shell.html` - Remote terminal

## API Endpoints

- `GET /api/devices` - List connected devices
- `GET /api/device/:deviceId/info` - Get device info
- `POST /api/command/:deviceId` - Send command to device
- `POST /api/upload/:deviceId` - Upload file to device
- `GET /api/download/:deviceId` - Download file from device
- `GET /api/stats` - Server statistics

## Command Protocol

Commands are sent as JSON:
```json
{
  "id": "cmd_123",
  "action": "device_info",
  "payload": {}
}
```

Responses:
```json
{
  "replyTo": "cmd_123",
  "status": "success",
  "data": {...}
}
```

## License

For personal and educational use only.
