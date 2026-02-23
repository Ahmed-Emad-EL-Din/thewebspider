import { decodeJwtResponse } from './auth';
import { Dashboard } from './components/Dashboard';
import { Toast } from './components/Toast';
import { addMonitorApi, editMonitorApi, checkAdminApi, getAdminStatsApi, toggleMonitorApi, deleteAccountApi, getAlertsApi, publishAlertApi } from './api';

// Globals
let userProfile = null;
let dashboardComp = null;
const LIMIT = 10;
let isAdminUser = false;
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "REPLACE_WITH_YOUR_CLIENT_ID.apps.googleusercontent.com";

// DOM Elements
const loginOverlay = document.getElementById('login-overlay');
const mainHeader = document.querySelector('.main-header');
const dashboardEl = document.getElementById('dashboard');
const userDisplayName = document.getElementById('user-display-name');
const logoutBtn = document.getElementById('logout-btn');
const addMonitorBtn = document.getElementById('add-monitor-btn');
const monitorCountText = document.getElementById('monitor-count-text');
const monitorLimitWarning = document.getElementById('monitor-limit-warning');

// Modal Elements
const monitorModal = document.getElementById('monitor-modal');
const modalTitle = document.getElementById('modal-title');
const submitBtn = document.getElementById('submit-monitor-btn');
const closeModalBtn = document.getElementById('close-modal-btn');
const addMonitorForm = document.getElementById('add-monitor-form');
const triggerModeCheck = document.getElementById('trigger-mode');
const aiFocusLabel = document.getElementById('ai-focus-label');
const aiFocusHelp = document.getElementById('ai-focus-help');
const aiFocusNoteInput = document.getElementById('ai-focus-note');
const visualModeCheck = document.getElementById('visual-mode');
const customWebhookUrlInput = document.getElementById('custom-webhook-url');
const deepCrawlCheck = document.getElementById('deep-crawl');
const deepCrawlOptions = document.getElementById('deep-crawl-options');
const deepCrawlDepthInput = document.getElementById('deep-crawl-depth');
const deepCrawlAlert = document.getElementById('deep-crawl-alert');
const requiresLoginCheck = document.getElementById('requires-login');
const loginFields = document.getElementById('login-fields');
const hasCaptchaCheck = document.getElementById('has-captcha');
const captchaFields = document.getElementById('captcha-fields');
const enableTelegramCheck = document.getElementById('enable-telegram');
const telegramFields = document.getElementById('telegram-fields');
const telegramConnectBtn = document.getElementById('telegram-connect-btn');
const telegramConnectedStatus = document.getElementById('telegram-connected-status');
const telegramConnectPrompt = document.getElementById('telegram-connect-prompt');
const telegramChatIdInput = document.getElementById('telegram-chat-id');
const enableWebhooksCheck = document.getElementById('enable-webhooks');
const webhookFields = document.getElementById('webhook-fields');

// Deep Crawl Modal Elements
const deepCrawlModal = document.getElementById('deep-crawl-modal');
const closeDeepCrawlBtn = document.getElementById('close-deep-crawl-btn');
const cancelDeepCrawlBtn = document.getElementById('cancel-deep-crawl-btn');
const confirmDeepCrawlBtn = document.getElementById('confirm-deep-crawl-btn');

// Form Modifiers
const targetUrlInput = document.getElementById('target-url');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const captchaJsonInput = document.getElementById('captcha-json');
const enableNotificationsCheck = document.getElementById('enable-notifications');
const checkFrequencySelect = document.getElementById('check-frequency');
let editingMonitorId = null; // null = Add Mode, string = Edit Mode

// Telegram State
let telegramPollingInterval = null;
let telegramBotUsername = null;

// Interactive Background Logic
const interactiveBg = document.getElementById('interactive-bg-logo');
if (interactiveBg) {
    document.addEventListener('mousemove', (e) => {
        if (loginOverlay.style.display !== 'none') {
            const x = (window.innerWidth / 2 - e.pageX) / 35;
            const y = (window.innerHeight / 2 - e.pageY) / 35;
            interactiveBg.style.transform = `translate(calc(-50% + ${-x}px), calc(-50% + ${-y}px)) rotate(${-x / 2}deg) scale(1.05)`;
        }
    });
}

// Initialize Google One Tap / Button
window.onload = function () {
    Toast.init();

    const storedProfile = localStorage.getItem('userProfile');
    if (storedProfile) {
        try {
            userProfile = JSON.parse(storedProfile);
            showDashboard();
            return; // Skip Google init if already logged in
        } catch (e) {
            localStorage.removeItem('userProfile');
        }
    }

    // Check if the script loaded properly. If not, don't crash the whole UI.
    if (window.google) {
        google.accounts.id.initialize({
            client_id: GOOGLE_CLIENT_ID,
            callback: handleCredentialResponse
        });
        google.accounts.id.renderButton(
            document.getElementById("google-login-btn"),
            { theme: "filled_blue", size: "large", shape: "pill" }
        );
    } else {
        Toast.error("Google Auth failed to load.");
    }
};

// --- Auth & Init ---
window.handleCredentialResponse = async (response) => {
    try {
        const payload = decodeJwtResponse(response.credential);
        userProfile = {
            name: payload.name,
            email: payload.email,
            picture: payload.picture
        };
        localStorage.setItem('userProfile', JSON.stringify(userProfile));

        // Use standard load function
        await showDashboard();

    } catch (error) {
        console.error("Login failed:", error);
        Toast.error("Login failed. Please try again.");
    }
};

async function showDashboard() {
    loginOverlay.style.display = 'none';
    mainHeader.style.display = 'block';
    dashboardEl.style.display = 'block';

    // Switch user display layout
    if (userDisplayName) userDisplayName.style.display = 'none'; // Hide old element if it still exists
    document.getElementById('user-actions').style.display = 'flex';
    document.getElementById('user-email-display').textContent = userProfile.email;

    Toast.success(`Welcome, ${userProfile.name}`);

    dashboardComp = new Dashboard(userProfile, updateLimitUI);

    // Check Admin Status
    isAdminUser = await checkAdminApi(userProfile.email);
    const topDashboardAdminBtn = document.getElementById('admin-dashboard-btn');
    const headerAdminBtn = document.getElementById('admin-panel-btn');

    if (isAdminUser || userProfile.email === 'mr.electron1915@gmail.com') {
        if (headerAdminBtn) headerAdminBtn.style.display = 'block';
        if (topDashboardAdminBtn) topDashboardAdminBtn.style.display = 'block';
    } else {
        if (headerAdminBtn) headerAdminBtn.style.display = 'none';
        if (topDashboardAdminBtn) topDashboardAdminBtn.style.display = 'none';
    }

    // Fetch System Alerts
    try {
        const alerts = await getAlertsApi(userProfile.email);
        const alertsContainer = document.getElementById('system-alerts-container');
        if (alerts && alerts.length > 0 && alertsContainer) {
            alertsContainer.innerHTML = '';
            alerts.forEach(alert => {
                const el = document.createElement('div');
                el.className = 'alert alert-info mb-2 p-3';
                el.innerHTML = `<strong>📢 System Message:</strong><br/><span style="font-size: 0.9em; margin-top: 5px; display: block;">${alert.message.replace(/\n/g, '<br/>')}</span>`;
                alertsContainer.appendChild(el);
            });
            alertsContainer.style.display = 'block';
        } else if (alertsContainer) {
            alertsContainer.style.display = 'none';
        }
    } catch (e) {
        console.error("Failed to fetch alerts:", e);
    }

    dashboardComp.load();
}

function updateLimitUI(count, limit) {
    monitorCountText.textContent = `You are using ${count} of ${limit} slots.`;
    if (count >= limit) {
        addMonitorBtn.disabled = true;
        monitorLimitWarning.style.display = 'block';
    } else {
        addMonitorBtn.disabled = false;
        monitorLimitWarning.style.display = 'none';
    }
}

function logout() {
    userProfile = null;
    localStorage.removeItem('userProfile');
    loginOverlay.style.display = 'flex';
    mainHeader.style.display = 'none';
    dashboardEl.style.display = 'none';
    Toast.info("Logged out successfully");
}

logoutBtn.addEventListener('click', logout);

// --- Modal Logic ---
function resetModalContent() {
    editingMonitorId = null;
    modalTitle.textContent = "Add watcher 🫣";
    submitBtn.textContent = "Start Watching";
    addMonitorForm.reset();

    // Reset Trigger Mode visual state
    document.getElementById('ai-trigger-fields').style.display = 'none';

    // Reset newly added inputs
    visualModeCheck.checked = false;
    customWebhookUrlInput.value = '';
    enableWebhooksCheck.checked = false;
    webhookFields.style.display = 'none';
    if (checkFrequencySelect) checkFrequencySelect.value = "1440";

    loginFields.style.display = 'none';
    captchaFields.style.display = 'none';
    telegramFields.style.display = 'none';
    deepCrawlOptions.style.display = 'none';
    deepCrawlAlert.style.display = 'none';

    if (telegramPollingInterval) clearInterval(telegramPollingInterval);
    telegramChatIdInput.value = '';
    telegramConnectPrompt.style.display = 'block';

    let p = document.querySelector('#telegram-connect-prompt p');
    if (p) p.style.display = 'block';

    telegramConnectBtn.className = "btn btn-outline btn-block";
    telegramConnectBtn.style.backgroundColor = "";
    telegramConnectBtn.style.borderColor = "";
    telegramConnectBtn.style.color = "";
    telegramConnectBtn.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M21 5L2 12.5L9 14M21 5L18.5 20L9 14M21 5L9 14M9 14V19.5L13.5 15.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        Connect Telegram App
    `;
}

addMonitorBtn.addEventListener('click', () => {
    if (dashboardComp && dashboardComp.monitors.length < LIMIT) {
        resetModalContent();
        monitorModal.style.display = 'flex';
    }
});

window.addEventListener('open-edit-modal', (e) => {
    const monitor = e.detail;
    resetModalContent();

    editingMonitorId = monitor._id;
    modalTitle.textContent = "Edit Webspider";
    submitBtn.textContent = "Save Changes";

    targetUrlInput.value = monitor.url;

    if (monitor.check_frequency) {
        checkFrequencySelect.value = monitor.check_frequency.toString();
    } else {
        checkFrequencySelect.value = "1440"; // Default
    }

    if (monitor.trigger_mode_enabled) {
        triggerModeCheck.checked = true;
        document.getElementById('ai-trigger-fields').style.display = 'block';
    } else {
        document.getElementById('ai-trigger-fields').style.display = 'none';
    }

    if (monitor.ai_focus_note) aiFocusNoteInput.value = monitor.ai_focus_note;

    if (monitor.visual_mode_enabled) visualModeCheck.checked = true;
    if (monitor.custom_webhook_url) {
        enableWebhooksCheck.checked = true;
        customWebhookUrlInput.value = monitor.custom_webhook_url;
        webhookFields.style.display = 'block';
    }

    if (monitor.deep_crawl) {
        deepCrawlCheck.checked = true;
        deepCrawlOptions.style.display = 'block';
        if (monitor.deep_crawl_depth) deepCrawlDepthInput.value = monitor.deep_crawl_depth;
    }

    if (monitor.requires_login) {
        requiresLoginCheck.checked = true;
        loginFields.style.display = 'block';
        if (monitor.username) usernameInput.value = monitor.username;
        if (monitor.password) passwordInput.value = monitor.password;
    }

    if (monitor.has_captcha) {
        hasCaptchaCheck.checked = true;
        captchaFields.style.display = 'block';
        if (monitor.captcha_json) captchaJsonInput.value = typeof monitor.captcha_json === 'string' ? monitor.captcha_json : JSON.stringify(monitor.captcha_json);
    }

    enableNotificationsCheck.checked = !!monitor.email_notifications_enabled;

    if (monitor.telegram_notifications_enabled) {
        enableTelegramCheck.checked = true;
        telegramFields.style.display = 'block';
        telegramChatIdInput.value = monitor.telegram_chat_id || '';

        // Show as connected since we already have the ID
        if (monitor.telegram_chat_id) {
            telegramConnectBtn.className = "btn btn-block";
            telegramConnectBtn.style.backgroundColor = "var(--success)";
            telegramConnectBtn.style.color = "white";
            telegramConnectBtn.innerHTML = `✅ Connected successfully! (ID: ${monitor.telegram_chat_id})`;
            let p = document.querySelector('#telegram-connect-prompt p');
            if (p) p.style.display = 'none';
        }
    }

    monitorModal.style.display = 'flex';
});

closeModalBtn.addEventListener('click', () => {
    monitorModal.style.display = 'none';
    if (telegramPollingInterval) clearInterval(telegramPollingInterval);
});

triggerModeCheck.addEventListener('change', (e) => {
    document.getElementById('ai-trigger-fields').style.display = e.target.checked ? 'block' : 'none';
});

deepCrawlCheck.addEventListener('click', (e) => {
    if (e.target.checked) {
        // User clicked to enable. Prevent the check until confirmed!
        e.preventDefault();
        deepCrawlModal.style.display = 'flex';
    } else {
        // User clicked to disable. Let it happen and hide the alert.
        deepCrawlOptions.style.display = 'none';
        deepCrawlAlert.style.display = 'none';
    }
});

const hideDeepCrawlModal = () => { deepCrawlModal.style.display = 'none'; };
closeDeepCrawlBtn.addEventListener('click', hideDeepCrawlModal);
cancelDeepCrawlBtn.addEventListener('click', hideDeepCrawlModal);

confirmDeepCrawlBtn.addEventListener('click', () => {
    deepCrawlCheck.checked = true;
    deepCrawlOptions.style.display = 'block';
    deepCrawlAlert.style.display = 'block';
    hideDeepCrawlModal();
});

requiresLoginCheck.addEventListener('change', (e) => {
    loginFields.style.display = e.target.checked ? 'block' : 'none';
});

hasCaptchaCheck.addEventListener('change', (e) => {
    captchaFields.style.display = e.target.checked ? 'block' : 'none';
});

enableTelegramCheck.addEventListener('change', async (e) => {
    telegramFields.style.display = e.target.checked ? 'block' : 'none';

    if (!e.target.checked) {
        clearInterval(telegramPollingInterval);
        telegramChatIdInput.value = '';
        telegramConnectPrompt.style.display = 'block';
        document.querySelector('#telegram-connect-prompt p').style.display = 'block';
        telegramConnectBtn.className = "btn btn-outline btn-block";
        telegramConnectBtn.style.backgroundColor = "";
        telegramConnectBtn.style.borderColor = "";
        telegramConnectBtn.style.color = "";
        telegramConnectBtn.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M21 5L2 12.5L9 14M21 5L18.5 20L9 14M21 5L9 14M9 14V19.5L13.5 15.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            Connect Telegram App
        `;
        return;
    }

    // Fetch bot config only once
    if (!telegramBotUsername) {
        const originalHtml = telegramConnectBtn.innerHTML;
        telegramConnectBtn.textContent = 'Loading Bot Info...';
        telegramConnectBtn.style.pointerEvents = 'none';

        try {
            const res = await fetch('/.netlify/functions/telegram-config');
            const data = await res.json();
            if (data.bot_username) {
                telegramBotUsername = data.bot_username;
            }
        } catch (error) {
            console.error("Telegram config error", error);
            Toast.error("Failed to fetch Telegram configuration");
            telegramConnectBtn.innerHTML = originalHtml;
            return; // Prevent further execution if config fails
        }
    }

    // Generate Deep Link
    const linkToken = crypto.randomUUID();
    telegramConnectBtn.href = `https://t.me/${telegramBotUsername}?start=${linkToken}`;
    telegramConnectBtn.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M21 5L2 12.5L9 14M21 5L18.5 20L9 14M21 5L9 14M9 14V19.5L13.5 15.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        Connect Telegram App
    `;
    telegramConnectBtn.style.pointerEvents = 'auto';

    // Start Polling for successful auth
    clearInterval(telegramPollingInterval);
    telegramPollingInterval = setInterval(async () => {
        try {
            const res = await fetch(`/.netlify/functions/telegram-auth-status?token=${linkToken}`);
            if (res.ok) {
                const result = await res.json();
                if (result.status === 'success' && result.chat_id) {
                    clearInterval(telegramPollingInterval);
                    telegramChatIdInput.value = result.chat_id;

                    // Update the button directly instead of hiding it
                    telegramConnectBtn.className = "btn btn-block"; // remove btn-outline
                    telegramConnectBtn.style.backgroundColor = "var(--success)";
                    telegramConnectBtn.style.borderColor = "var(--success)";
                    telegramConnectBtn.style.color = "white";
                    telegramConnectBtn.style.pointerEvents = "none";
                    telegramConnectBtn.innerHTML = `✅ Connected successfully! (ID: ${result.chat_id})`;

                    // Hide the instructional prompt paragraph, but keep the button
                    document.querySelector('#telegram-connect-prompt p').style.display = 'none';

                    Toast.success("Telegram connected successfully!");
                }
            }
        } catch (e) {
            console.error("Polling error", e);
        }
    }, 2500);
});

enableWebhooksCheck.addEventListener('change', (e) => {
    webhookFields.style.display = e.target.checked ? 'block' : 'none';
});

// --- Form Submission ---
addMonitorForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const formData = {
        user_email: userProfile.email,
        url: targetUrlInput.value,
        ai_focus_note: aiFocusNoteInput ? aiFocusNoteInput.value.trim() : '',
        trigger_mode_enabled: triggerModeCheck.checked,
        visual_mode_enabled: visualModeCheck.checked,
        custom_webhook_url: customWebhookUrlInput.value.trim(),
        deep_crawl: deepCrawlCheck.checked,
        deep_crawl_depth: deepCrawlDepthInput ? parseInt(deepCrawlDepthInput.value, 10) : 1,
        check_frequency: checkFrequencySelect ? parseInt(checkFrequencySelect.value, 10) : 1440,
        requires_login: requiresLoginCheck.checked,
        username: usernameInput.value,
        password: passwordInput.value,
        has_captcha: hasCaptchaCheck.checked,
        captcha_json: captchaJsonInput.value,
        email_notifications_enabled: enableNotificationsCheck.checked,
        telegram_notifications_enabled: enableTelegramCheck.checked,
        telegram_chat_id: document.getElementById('telegram-chat-id').value
    };

    if (formData.telegram_notifications_enabled && !formData.telegram_chat_id) {
        Toast.error("Please completely connect your Telegram account first.");
        return;
    }

    try {
        const origText = submitBtn.textContent;
        submitBtn.textContent = editingMonitorId ? 'Saving...' : 'Adding...';
        submitBtn.disabled = true;

        if (editingMonitorId) {
            formData.id = editingMonitorId;
            await editMonitorApi(formData);
            Toast.success("Monitor updated successfully!");
        } else {
            await addMonitorApi(formData);
            Toast.success("Monitor added successfully!");
        }

        monitorModal.style.display = 'none';
        resetModalContent();

        if (dashboardComp) await dashboardComp.load();

        submitBtn.textContent = origText;
        submitBtn.disabled = false;

    } catch (error) {
        console.error(error);
        Toast.error(error.message || "Failed to process monitor");
        submitBtn.textContent = editingMonitorId ? 'Save Changes' : 'Start Watching';
        submitBtn.disabled = false;
    }
});

// ==========================================
// ADMIN DASHBOARD LOGIC
// ==========================================
const adminPanelBtn = document.getElementById('admin-panel-btn');
const backToAppBtn = document.getElementById('back-to-app-btn');
const adminDashboard = document.getElementById('admin-dashboard');

adminPanelBtn.addEventListener('click', async () => {
    document.getElementById('dashboard').style.display = 'none';
    adminDashboard.style.display = 'block';
    await loadAdminStats();
});

backToAppBtn.addEventListener('click', () => {
    adminDashboard.style.display = 'none';
    document.getElementById('dashboard').style.display = 'block';
});

async function loadAdminStats() {
    try {
        const tbody = document.getElementById('admin-table-body');
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-secondary py-4">Loading...</td></tr>';

        const stats = await getAdminStatsApi(userProfile.email);

        document.getElementById('admin-total-users').textContent = stats.total_users;
        document.getElementById('admin-total-monitors').textContent = stats.total_monitors;
        document.getElementById('admin-total-failed').textContent = stats.total_failed_runs;

        tbody.innerHTML = '';

        if (stats.monitors.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center text-secondary py-4">No monitors found in database.</td></tr>';
            return;
        }

        stats.monitors.forEach(monitor => {
            const tr = document.createElement('tr');
            const isPaused = monitor.is_paused;
            const hasFailed = monitor.last_run_status === 'failed';

            const statusBadge = hasFailed ? `<span class="text-danger">Failed</span>` : `<span style="color:var(--success)">Healthy</span>`;
            const pauseText = isPaused ? 'Resume' : 'Pause';

            tr.innerHTML = `
                <td>${monitor.user_email}</td>
                <td><a href="${monitor.url}" target="_blank" style="color:var(--primary); text-decoration:none;">${monitor.url.substring(0, 30)}...</a></td>
                <td>${isPaused ? '<span class="text-warning">Paused</span>' : statusBadge}</td>
                <td style="font-size:0.8rem; color:var(--text-secondary); max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${monitor.last_error || ''}">
                    ${hasFailed ? monitor.last_error : (monitor.last_error_time ? 'Recovered' : '-')}
                </td>
                <td>
                    <div style="display:flex; gap:4px;">
                        <button class="btn btn-sm ${isPaused ? 'btn-primary' : 'btn-outline'}" onclick="window.toggleAdminPause('${monitor._id}', ${!isPaused})" style="font-size:0.75rem;">${pauseText}</button>
                        <button class="btn btn-sm btn-outline" style="font-size:0.75rem; border-color:var(--danger); color:var(--danger);" onclick="window.deleteAdminAccount('${monitor.user_email}')" title="Delete ALL monitors for this user">Delete User</button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });

    } catch (e) {
        console.error(e);
        Toast.error("Failed to load admin stats");
    }
}

window.toggleAdminPause = async (id, setPaused) => {
    try {
        await toggleMonitorApi(userProfile.email, id, setPaused);
        Toast.success(setPaused ? "Monitor paused" : "Monitor resumed");
        await loadAdminStats();
    } catch (e) {
        Toast.error("Action failed");
    }
};

window.deleteAdminAccount = async (targetEmail) => {
    if (!confirm(`🚨 DANGER: Are you sure you want to delete the account for ${targetEmail}? This will permanently delete ALL their tracked monitors. This action cannot be undone.`)) {
        return;
    }

    try {
        const result = await deleteAccountApi(userProfile.email, targetEmail);
        Toast.success(result.message || "Account deleted successfully");
        await loadAdminStats();
    } catch (e) {
        console.error(e);
        Toast.error(e.message || "Failed to delete account");
    }
};

// Admin Alert Publication
window.publishAdminAlert = async () => {
    const targetEmail = document.getElementById('alert-target-email').value.trim();
    const message = document.getElementById('alert-message-body').value.trim();
    const isActive = document.getElementById('alert-is-active').checked;

    if (!message) {
        Toast.error('Alert message cannot be empty');
        return;
    }

    const btn = document.getElementById('publish-alert-btn');
    btn.disabled = true;
    btn.textContent = 'Publishing...';

    try {
        await publishAlertApi(userProfile.email, targetEmail, message, isActive);
        Toast.success('Alert published successfully!');
        document.getElementById('alert-message-body').value = '';
    } catch (error) {
        Toast.error(error.message || 'Failed to publish alert');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Publish Alert';
    }
};
