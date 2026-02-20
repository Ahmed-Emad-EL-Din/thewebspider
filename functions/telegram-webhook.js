const { MongoClient } = require('mongodb');

// Netlify now supports Node 18/20 by default which has native fetch.
const fetch = global.fetch;

let cachedClient = null;

async function connectToDatabase() {
    if (cachedClient) {
        return cachedClient.db('thewebspider');
    }
    const client = new MongoClient(process.env.MONGO_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
    });
    await client.connect();
    cachedClient = client;
    return client.db('thewebspider');
}

exports.handler = async (event, context) => {
    // Webhooks should be POST requests
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const body = JSON.parse(event.body);

        // Check if message exists and has text
        if (body.message && body.message.text) {
            const text = body.message.text;
            const chat_id = body.message.chat.id;

            // Handle the deep-linked /start command
            // Format: /start <token>
            if (text.startsWith('/start ')) {
                const token = text.split(' ')[1];

                if (token && token.length > 0) {
                    const db = await connectToDatabase();
                    const tokensCollection = db.collection('telegram_tokens');

                    // Upsert to handle potential duplicates for the same token
                    await tokensCollection.updateOne(
                        { token: token },
                        { $set: { chat_id: chat_id.toString(), created_at: new Date() } },
                        { upsert: true }
                    );

                    // Send an acknowledgment back to the user via Telegram
                    const botToken = process.env.TELEGRAM_BOT_TOKEN;
                    if (botToken) {
                        const messageText = "✅ Authentication Successful!\n\nYour Telegram account is now linked to the TheWebspider Dashboard. Your unique Chat ID has been automatically populated.\n\nYou can close this chat and return to the dashboard.";

                        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                chat_id: chat_id,
                                text: messageText
                            })
                        });
                    }
                }
            } else if (text === '/start') {
                // Generic start without token
                const botToken = process.env.TELEGRAM_BOT_TOKEN;
                if (botToken) {
                    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            chat_id: chat_id,
                            text: "Welcome to TheWebspider Bot! Start the connection process from the dashboard website to link your account."
                        })
                    });
                }
            }
        }

        // Always return 200 OK so Telegram stops retrying the webhook
        return { statusCode: 200, body: 'OK' };

    } catch (error) {
        console.error('Webhook processing error:', error);
        // Still return 200, otherwise Telegram will keep bombarding us with failing messages
        return { statusCode: 200, body: 'Error logged' };
    }
};
