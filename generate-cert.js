/**
 * Generate self-signed SSL certificate for HTTPS
 * Run this once: node generate-cert.js
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const certsDir = path.join(__dirname, 'certs');

if (!fs.existsSync(certsDir)) {
    fs.mkdirSync(certsDir, { recursive: true });
}

const keyPath = path.join(certsDir, 'key.pem');
const certPath = path.join(certsDir, 'cert.pem');

if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    console.log('✅ SSL certificates already exist in certs/');
    process.exit(0);
}

// Generate using Node.js crypto (no openssl needed)
import('crypto').then(async (crypto) => {
    const { generateKeyPairSync, createSign, X509Certificate } = crypto;

    // Generate RSA key pair
    const { privateKey, publicKey } = generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    // Create self-signed certificate using forge approach
    // Since Node doesn't have built-in cert creation, we'll use a simpler method
    try {
        // Try openssl first (might be available)
        execSync(`openssl req -x509 -newkey rsa:2048 -keyout "${keyPath}" -out "${certPath}" -days 365 -nodes -subj "/CN=RemoteAccess" -batch`, {
            stdio: 'pipe',
        });
        console.log('✅ SSL certificate generated with OpenSSL');
    } catch (e) {
        // Fallback: save keys and create a minimal script
        console.log('OpenSSL not found. Installing selfsigned package...');
        try {
            execSync('npm install selfsigned --save-dev', { stdio: 'inherit', cwd: __dirname });
            const selfsigned = await import('selfsigned');
            const attrs = [{ name: 'commonName', value: 'RemoteAccess' }];
            const pems = selfsigned.generate(attrs, {
                days: 365,
                keySize: 2048,
                algorithm: 'sha256',
                extensions: [
                    {
                        name: 'subjectAltName', altNames: [
                            { type: 7, ip: '192.168.29.87' },
                            { type: 7, ip: '127.0.0.1' },
                            { type: 2, value: 'localhost' },
                        ]
                    },
                ],
            });
            fs.writeFileSync(keyPath, pems.private);
            fs.writeFileSync(certPath, pems.cert);
            console.log('✅ SSL certificate generated with selfsigned');
        } catch (e2) {
            console.error('❌ Could not generate certificate:', e2.message);
            process.exit(1);
        }
    }
});
