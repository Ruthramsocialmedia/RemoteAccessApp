module.exports = {
    PORT: process.env.PORT || 3000,
    WS_HEARTBEAT_INTERVAL: 30000, // 30 seconds
    ADMIN_SECRET: process.env.ADMIN_SECRET || 'changeme123'
};
