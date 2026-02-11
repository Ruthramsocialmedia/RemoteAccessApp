import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  secretKey: process.env.SECRET_KEY || 'default-secret-key',
  
  // WebSocket settings
  websocket: {
    pingInterval: 30000, // 30 seconds
    connectionTimeout: 60000, // 60 seconds
  },
  
  // File upload settings
  upload: {
    maxFileSize: 100 * 1024 * 1024, // 100MB
    allowedMimeTypes: ['*'], // Allow all file types
  },
  
  // Render deployment settings
  isDevelopment: process.env.NODE_ENV !== 'production',
  isProduction: process.env.NODE_ENV === 'production',
};

export default config;
