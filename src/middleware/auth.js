/**
 * Authentication Middleware
 * 
 * Cookie-based auth using HMAC-signed tokens.
 * No external dependencies — uses Node.js built-in crypto.
 */

import crypto from 'crypto';
import config from '../config.js';

// Paths that don't require authentication
const PUBLIC_PATHS = [
    '/login.html',
    '/auth/login',
    '/auth/logout',
    '/auth/check',
    '/health',
    '/api/device-upload-temp',
];

/**
 * Create a signed auth token
 * Format: username:expiry:signature
 */
export function createToken(username) {
    const expiry = Date.now() + config.auth.tokenExpiry;
    const payload = `${username}:${expiry}`;
    const signature = crypto
        .createHmac('sha256', config.secretKey)
        .update(payload)
        .digest('hex');
    return `${payload}:${signature}`;
}

/**
 * Verify a signed auth token
 * Returns { valid, username } or { valid: false }
 */
export function verifyToken(token) {
    if (!token) return { valid: false };

    const parts = token.split(':');
    if (parts.length !== 3) return { valid: false };

    const [username, expiry, signature] = parts;

    // Check expiry
    if (Date.now() > parseInt(expiry, 10)) {
        return { valid: false, reason: 'expired' };
    }

    // Verify signature
    const payload = `${username}:${expiry}`;
    const expectedSignature = crypto
        .createHmac('sha256', config.secretKey)
        .update(payload)
        .digest('hex');

    if (signature !== expectedSignature) {
        return { valid: false, reason: 'invalid_signature' };
    }

    return { valid: true, username };
}

/**
 * Parse cookies from request header
 */
function parseCookies(req) {
    const cookies = {};
    const header = req.headers.cookie;
    if (!header) return cookies;

    header.split(';').forEach(cookie => {
        const [name, ...rest] = cookie.trim().split('=');
        cookies[name] = decodeURIComponent(rest.join('='));
    });

    return cookies;
}

/**
 * Authentication middleware
 * 
 * Checks for auth_token cookie on every request.
 * Skips: public paths, WebSocket upgrades, static assets for login page.
 */
export function authMiddleware(req, res, next) {
    const pathname = req.path;

    // Skip auth for public paths
    if (PUBLIC_PATHS.some(p => pathname === p || pathname.startsWith(p))) {
        return next();
    }

    // Skip auth for login page assets (CSS/JS needed to render login)
    if (pathname === '/css/hacker-theme.css' || pathname === '/js/api.js') {
        return next();
    }

    // Parse cookies
    const cookies = parseCookies(req);
    const token = cookies.auth_token;

    // Verify token
    const result = verifyToken(token);

    if (!result.valid) {
        // API requests get JSON 401
        if (pathname.startsWith('/api/')) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required',
            });
        }

        // Dashboard pages get redirected to login
        return res.redirect('/login.html');
    }

    // Token is valid — attach username to request
    req.adminUser = result.username;
    next();
}

export default authMiddleware;
