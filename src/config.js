import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  secretKey: process.env.SECRET_KEY,

  // Authentication settings
  auth: {
    username: process.env.ADMIN_USERNAME,
    password: process.env.ADMIN_PASSWORD,
    tokenExpiry: 24 * 60 * 60 * 1000, // 24 hours
  },

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
