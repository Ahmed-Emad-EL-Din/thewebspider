const fetch = global.fetch || require('node-fetch');

exports.handler = async (event, context) => {
    // Only allow GET requests
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const netlifyUrl = process.env.NETLIFY_URL;

    if (!botToken || !netlifyUrl) {
        return { statusCode: 500, body: JSON.stringify({ error: 'Server misconfigured. Check TELEGRAM_BOT_TOKEN and NETLIFY_URL environment variables.' }) };
    }

    try {
        // 1. Fetch Bot Info (Username)
        const getMeRes = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
        const getMeData = await getMeRes.json();

        if (!getMeData.ok) {
            return { statusCode: 500, body: JSON.stringify({ error: 'Failed to authenticate Bot Token with Telegram', details: getMeData }) };
        }

        const botUsername = getMeData.result.username;

        // 2. Automate Webhook Management
        // Only attempt to set webhook if we have an https production URL (Telegram requires HTTPS)
        if (netlifyUrl.startsWith('https://')) {
            const desiredWebhookUrl = `${netlifyUrl}/.netlify/functions/telegram-webhook`;

            // Check current webhook info
            const webhookInfoRes = await fetch(`https://api.telegram.org/bot${botToken}/getWebhookInfo`);
            const webhookInfo = await webhookInfoRes.json();

            // If the URL is different or not set, set it now.
            if (!webhookInfo.ok || webhookInfo.result.url !== desiredWebhookUrl) {
                console.log(`Setting new Telegram webhook URL to: ${desiredWebhookUrl}`);
                await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url: desiredWebhookUrl })
                });
            }
        } else {
            console.log(`Skipping Telegram Webhook setup because NETLIFY_URL is not HTTPS (${netlifyUrl})`);
        }

        // Return the needed config to the frontend
        return {
            statusCode: 200,
            body: JSON.stringify({
                bot_username: botUsername,
                webhook_management: netlifyUrl.startsWith('https://') ? 'active' : 'skipped (requires secure https domain)'
            })
        };

    } catch (error) {
        console.error('API Error in telegram-config:', error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Internal server error while configuring Telegram' }) };
    }
};
