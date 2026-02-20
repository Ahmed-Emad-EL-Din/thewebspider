import { fetchMonitorsApi, deleteMonitorApi } from '../api.js';
import { Toast } from './Toast.js';

export class Dashboard {
    constructor(userProfile, onMonitorDeleted) {
        this.userProfile = userProfile;
        this.onMonitorDeleted = onMonitorDeleted;
        this.monitorsGrid = document.getElementById('monitors-grid');
        this.monitors = [];
        this.LIMIT = 10;

        // Expose global delete for the onclick handler in HTML
        window.deleteMonitor = this.deleteMonitor.bind(this);
    }

    async load() {
        this.monitorsGrid.innerHTML = '<div class="loading-state"><div class="loader"></div><p>Syncing monitors...</p></div>';
        try {
            this.monitors = await fetchMonitorsApi(this.userProfile.email);
            this.render();
            if (this.onMonitorDeleted) this.onMonitorDeleted(this.monitors.length, this.LIMIT);
        } catch (error) {
            console.error("Error fetching monitors:", error);
            this.monitorsGrid.innerHTML = '<p class="text-secondary text-center">Error loading monitors. Please try again.</p>';
            Toast.error("Failed to load monitors");
        }
    }

    render() {
        if (this.monitors.length === 0) {
            this.monitorsGrid.innerHTML = '<div class="loading-state"><p>No pages being watched yet. Add one to get started!</p></div>';
            return;
        }

        this.monitorsGrid.innerHTML = '';
        this.monitors.forEach(monitor => {
            const card = document.createElement('div');
            card.className = 'monitor-card animate-fade-in';
            card.innerHTML = `
                <a href="${monitor.url}" target="_blank" class="monitor-url">${monitor.url}</a>
                <div class="monitor-status">
                    <span class="badge-active">● Active</span>
                    <span class="text-secondary ml-2">Updated: ${new Date(monitor.last_updated_timestamp).toLocaleDateString()}</span>
                </div>
                <div class="ai-summary">
                    <h4>Latest AI summary</h4>
                    <p>${monitor.latest_ai_summary || 'Waiting for next run...'}</p>
                </div>
                <div class="monitor-footer">
                    <div class="text-secondary" style="font-size: 0.75rem;">
                        ${monitor.requires_login ? '🔑 Login ' : ''} 
                        ${monitor.has_captcha ? '🍪 Cookies ' : ''}
                        ${monitor.email_notifications_enabled ? '📧 Email ' : ''}
                        ${monitor.telegram_notifications_enabled ? '✈️ Telegram' : ''}
                    </div>
                    <button class="delete-btn" onclick="deleteMonitor('${monitor._id}')">Delete</button>
                </div>
            `;
            this.monitorsGrid.appendChild(card);
        });
    }

    async deleteMonitor(id) {
        if (!confirm("Stop watching this page?")) return;

        try {
            await deleteMonitorApi(id, this.userProfile.email);
            Toast.success("Monitor deleted successfully");
            await this.load();
        } catch (error) {
            console.error(error);
            Toast.error("Failed to delete monitor");
        }
    }
}
