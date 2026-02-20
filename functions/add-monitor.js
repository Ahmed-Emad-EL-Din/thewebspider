const { getDb } = require('./utils/db');

exports.handler = async (event, context) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const data = JSON.parse(event.body);
        const { user_email, url, deep_crawl, requires_login, has_captcha, username, password, captcha_json, email_notifications_enabled, telegram_notifications_enabled, telegram_chat_id } = data;

        if (!user_email || !url) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Missing required fields' }) };
        }

        const db = await getDb();
        const collection = db.collection('monitors');

        // Verify the 10-page limit
        const count = await collection.countDocuments({ user_email });
        if (count >= 10) {
            return {
                statusCode: 403,
                body: JSON.stringify({ error: 'You have reached the maximum limit of 10 monitored pages.' })
            };
        }

        const newMonitor = {
            user_email,
            url,
            deep_crawl: !!deep_crawl,
            requires_login: !!requires_login,
            has_captcha: !!has_captcha,
            username: username || '',
            password: password || '', // Assuming simplified storage for this demo
            captcha_json: captcha_json || null,
            email_notifications_enabled: !!email_notifications_enabled,
            telegram_notifications_enabled: !!telegram_notifications_enabled,
            telegram_chat_id: telegram_chat_id || '',
            last_scraped_text: '',
            latest_ai_summary: 'Pending first run...',
            is_first_run: true,
            last_updated_timestamp: new Date()
        };

        await collection.insertOne(newMonitor);

        return {
            statusCode: 201,
            body: JSON.stringify({ message: 'Monitor added successfully' }),
        };
    } catch (error) {
        console.error('Error adding monitor:', error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Internal Server Error' }) };
    }
};
