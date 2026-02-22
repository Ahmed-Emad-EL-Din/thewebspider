import { decodeJwtResponse } from './auth';
import { Dashboard } from './components/Dashboard';
import { Toast } from './components/Toast';
import { addMonitorApi, editMonitorApi, checkAdminApi, getAdminStatsApi, toggleMonitorApi } from './api';

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
const aiFocusNoteInput = document.getElementById('ai-focus-note');
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
    userDisplayName.style.display = 'none'; // Hide old element if it still exists
    document.getElementById('user-actions').style.display = 'flex';
    document.getElementById('user-email-display').textContent = userProfile.email;

    Toast.success(`Welcome, ${userProfile.name}`);

    dashboardComp = new Dashboard(userProfile, updateLimitUI);

    // Check Admin Status
    isAdminUser = await checkAdminApi(userProfile.email);
    if (isAdminUser) {
        document.getElementById('admin-panel-btn').style.display = 'block';
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
    modalTitle.textContent = "Add New TheWebspider";
    submitBtn.textContent = "Start Watching";
    addMonitorForm.reset();
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
    if (monitor.ai_focus_note) aiFocusNoteInput.value = monitor.ai_focus_note;

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

// --- Form Submission ---
addMonitorForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const formData = {
        user_email: userProfile.email,
        url: targetUrlInput.value,
        ai_focus_note: aiFocusNoteInput ? aiFocusNoteInput.value.trim() : '',
        deep_crawl: deepCrawlCheck.checked,
        deep_crawl_depth: deepCrawlDepthInput ? parseInt(deepCrawlDepthInput.value, 10) : 1,
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
