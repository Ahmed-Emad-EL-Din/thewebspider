export class Toast {
    static init() {
        if (!document.getElementById('toast-container')) {
            const container = document.createElement('div');
            container.id = 'toast-container';
            container.className = 'toast-container';
            document.body.appendChild(container);
        }
    }

    static show(message, type = 'info') {
        this.init();
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');

        let icon = 'ℹ️';
        if (type === 'success') icon = '✅';
        if (type === 'error') icon = '❌';
        if (type === 'warning') icon = '⚠️';

        toast.className = `toast toast-${type} animate-slide-up`;
        toast.innerHTML = `<span class="toast-icon">${icon}</span> <span class="toast-message">${message}</span>`;

        container.appendChild(toast);

        // Remove after 3 seconds
        setTimeout(() => {
            toast.classList.replace('animate-slide-up', 'animate-fade-out');
            setTimeout(() => toast.remove(), 300); // Wait for fade out animation
        }, 3000);
    }

    static success(msg) { this.show(msg, 'success'); }
    static error(msg) { this.show(msg, 'error'); }
    static warning(msg) { this.show(msg, 'warning'); }
    static info(msg) { this.show(msg, 'info'); }
}
