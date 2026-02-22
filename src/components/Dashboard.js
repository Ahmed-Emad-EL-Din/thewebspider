import { fetchMonitorsApi, deleteMonitorApi } from '../api.js';
import { Toast } from './Toast.js';

export class Dashboard {
    constructor(userProfile, onMonitorDeleted) {
        this.userProfile = userProfile;
        this.onMonitorDeleted = onMonitorDeleted;
        this.monitorsGrid = document.getElementById('monitors-grid');
        this.monitors = [];
        this.LIMIT = 10;

        this.LIMIT = 10;

        // Expose global methods for the onclick handler in HTML strings
        window.deleteMonitor = this.deleteMonitor.bind(this);
        window.editMonitor = this.editMonitor.bind(this);
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
                ${monitor.ai_focus_note ? `<div class="ai-focus-badge mb-2"><small><strong>🧠 AI Focus:</strong> ${monitor.ai_focus_note}</small></div>` : ''}
                <div class="monitor-status">
                    <span class="badge-active">● Active</span>
                    <span class="text-secondary ml-2">Updated: ${new Date(monitor.last_updated_timestamp).toLocaleDateString()}</span>
                </div>
                <div class="ai-summary">
                    <h4>Latest AI summary</h4>
                    <p>${monitor.latest_ai_summary || 'Waiting for next run...'}</p>
                </div>
                <div class="monitor-footer">
                    <div class="text-secondary" style="font-size: 0.75rem; display: flex; align-items: center; gap: 8px;">
                        ${monitor.deep_crawl ? `<span>🕷️ Depth: ${monitor.deep_crawl_depth || 1}</span>` : ''}
                        ${monitor.requires_login ? '<span>🔑 Login</span>' : ''} 
                        ${monitor.has_captcha ? '<span>🍪 Cookies</span>' : ''}
                        ${monitor.email_notifications_enabled ? '<span style="display:flex; align-items:center; gap:4px;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg> Email</span>' : ''}
                        ${monitor.telegram_notifications_enabled ? '<span style="display:flex; align-items:center; gap:4px;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M21 5L2 12.5L9 14M21 5L18.5 20L9 14M21 5L9 14M9 14V19.5L13.5 15.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg> Telegram</span>' : ''}
                    </div>
                    <div style="display:flex; gap:10px;">
                        <button class="edit-btn btn-outline btn-sm" onclick="editMonitor('${monitor._id}')" style="font-size: 0.8rem; padding: 4px 10px;">Edit</button>
                        <button class="delete-btn" onclick="deleteMonitor('${monitor._id}')">Delete</button>
                    </div>
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

    editMonitor(id) {
        // Find the full monitor object
        const monitor = this.monitors.find(m => m._id === id);
        if (!monitor) return;

        // Dispatch custom event to let main.js open the modal with data
        window.dispatchEvent(new CustomEvent('open-edit-modal', { detail: monitor }));
    }
}
