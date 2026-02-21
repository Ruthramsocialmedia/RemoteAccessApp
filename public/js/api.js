/**
 * Shared API Helper for Admin Dashboard
 */

class RemoteAPI {
    constructor() {
        this.baseURL = window.location.origin;
        this.ws = null;
        this.deviceId = new URLSearchParams(window.location.search).get('deviceId');
    }

    /**
     * Make API request
     */
    async request(endpoint, options = {}) {
        try {
            const response = await fetch(`${this.baseURL}/api${endpoint}`, {
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers,
                },
                credentials: 'same-origin',
                ...options,
            });

            // Redirect to login if session expired
            if (response.status === 401) {
                window.location.href = '/login.html';
                return;
            }

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || `HTTP ${response.status}`);
            }

            return data;
        } catch (error) {
            this.showToast(error.message, 'error');
            throw error;
        }
    }

    /**
     * Get all connected devices
     */
    async getDevices() {
        return this.request('/devices');
    }

    /**
     * Get device info
     */
    async getDeviceInfo(deviceId) {
        return this.request(`/device/${deviceId}/info`);
    }

    /**
     * Send command to device
     */
    async sendCommand(deviceId, action, payload = {}) {
        return this.request(`/command/${deviceId}`, {
            method: 'POST',
            body: JSON.stringify({ action, payload }),
        });
    }

    /**
     * Upload file to device
     */
    async uploadFile(deviceId, file, targetPath) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('targetPath', targetPath);

        try {
            const response = await fetch(`${this.baseURL}/api/upload/${deviceId}`, {
                method: 'POST',
                body: formData,
                credentials: 'same-origin',
            });

            // Redirect to login if session expired
            if (response.status === 401) {
                window.location.href = '/login.html';
                return;
            }

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Upload failed');
            }

            this.showToast('File uploaded successfully', 'success');
            return data;
        } catch (error) {
            this.showToast(error.message, 'error');
            throw error;
        }
    }

    /**
     * Download file from device
     */
    downloadFile(deviceId, filePath) {
        const url = `${this.baseURL}/api/download/${deviceId}?path=${encodeURIComponent(filePath)}`;
        window.open(url, '_blank');
    }

    /**
     * Show toast notification
     */
    showToast(message, type = 'info') {
        // Create toast container if it doesn't exist
        let container = document.getElementById('toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-container';
            container.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 10000;
      `;
            document.body.appendChild(container);
        }

        // Create toast element
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.style.cssText = `
      background: ${type === 'error' ? '#ef4444' : type === 'success' ? '#10b981' : '#3b82f6'};
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      margin-bottom: 10px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      animation: slideIn 0.3s ease;
      max-width: 300px;
    `;
        toast.textContent = message;

        container.appendChild(toast);

        // Remove after 3 seconds
        setTimeout(() => {
            toast.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    /**
     * Format file size
     */
    formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    }

    /**
     * Format date
     */
    formatDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleString();
    }
}

// Add animations
const style = document.createElement('style');
style.textContent = `
  @keyframes slideIn {
    from {
      transform: translateX(100%);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }
  
  @keyframes slideOut {
    from {
      transform: translateX(0);
      opacity: 1;
    }
    to {
      transform: translateX(100%);
      opacity: 0;
    }
  }
`;
document.head.appendChild(style);

// Global API instance
window.api = new RemoteAPI();
