import { decodeJwtResponse } from './auth';
import { Dashboard } from './components/Dashboard';
import { Toast } from './components/Toast';
import { addMonitorApi } from './api';

// Globals
let userProfile = null;
let dashboardComp = null;
const LIMIT = 10;
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
const closeModalBtn = document.getElementById('close-modal-btn');
const addMonitorForm = document.getElementById('add-monitor-form');
const deepCrawlCheck = document.getElementById('deep-crawl');
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

// Telegram State
let telegramPollingInterval = null;
let telegramBotUsername = null;

// Initialize Google One Tap / Button
window.onload = function () {
    Toast.init();

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

function handleCredentialResponse(response) {
    try {
        const responsePayload = decodeJwtResponse(response.credential);
        userProfile = {
            name: responsePayload.name,
            email: responsePayload.email,
            picture: responsePayload.picture
        };
        showDashboard();
    } catch (e) {
        Toast.error("Authentication failed. Please try again.");
    }
}

function showDashboard() {
    loginOverlay.style.display = 'none';
    mainHeader.style.display = 'block';
    dashboardEl.style.display = 'block';
    userDisplayName.textContent = userProfile.name;
    Toast.success(`Welcome, ${userProfile.name}`);

    dashboardComp = new Dashboard(userProfile, updateLimitUI);
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
    loginOverlay.style.display = 'flex';
    mainHeader.style.display = 'none';
    dashboardEl.style.display = 'none';
    Toast.info("Logged out successfully");
}

logoutBtn.addEventListener('click', logout);

// --- Modal Logic ---
addMonitorBtn.addEventListener('click', () => {
    if (dashboardComp && dashboardComp.monitors.length < LIMIT) {
        monitorModal.style.display = 'flex';
    }
});

closeModalBtn.addEventListener('click', () => {
    monitorModal.style.display = 'none';
    if (telegramPollingInterval) clearInterval(telegramPollingInterval);
});

deepCrawlCheck.addEventListener('change', (e) => {
    deepCrawlAlert.style.display = e.target.checked ? 'block' : 'none';
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
        telegramConnectedStatus.style.display = 'none';
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
                    telegramConnectPrompt.style.display = 'none';
                    telegramConnectedStatus.textContent = `✅ Linked successfully (ID: ${result.chat_id})`;
                    telegramConnectedStatus.style.display = 'block';
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
        url: document.getElementById('target-url').value,
        deep_crawl: deepCrawlCheck.checked,
        requires_login: requiresLoginCheck.checked,
        username: document.getElementById('username').value,
        password: document.getElementById('password').value,
        has_captcha: hasCaptchaCheck.checked,
        captcha_json: document.getElementById('captcha-json').value,
        email_notifications_enabled: document.getElementById('enable-notifications').checked,
        telegram_notifications_enabled: enableTelegramCheck.checked,
        telegram_chat_id: document.getElementById('telegram-chat-id').value
    };

    try {
        const addBtn = addMonitorForm.querySelector('button[type="submit"]');
        const origText = addBtn.textContent;
        addBtn.textContent = 'Adding...';
        addBtn.disabled = true;

        await addMonitorApi(formData);

        Toast.success("Monitor added successfully!");
        monitorModal.style.display = 'none';
        addMonitorForm.reset();
        loginFields.style.display = 'none';
        captchaFields.style.display = 'none';
        telegramFields.style.display = 'none';

        if (telegramPollingInterval) clearInterval(telegramPollingInterval);
        telegramChatIdInput.value = '';
        telegramConnectPrompt.style.display = 'block';
        telegramConnectedStatus.style.display = 'none';

        if (dashboardComp) await dashboardComp.load();

        addBtn.textContent = origText;
        addBtn.disabled = false;

    } catch (error) {
        console.error(error);
        Toast.error(error.message || "Failed to add monitor");
        const addBtn = addMonitorForm.querySelector('button[type="submit"]');
        addBtn.textContent = 'Start Watching';
        addBtn.disabled = false;
    }
});
