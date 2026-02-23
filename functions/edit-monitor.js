const { getDb } = require('./utils/db');
const { ObjectId } = require('mongodb');

exports.handler = async (event, context) => {
    if (event.httpMethod !== 'PUT') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const data = JSON.parse(event.body);
        const { id, user_email, url, ai_focus_note, trigger_mode_enabled, visual_mode_enabled, custom_webhook_url, deep_crawl, deep_crawl_depth, check_frequency, requires_login, has_captcha, username, password, captcha_json, email_notifications_enabled, telegram_notifications_enabled, telegram_chat_id } = data;

        if (!id || !user_email || !url) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Missing required fields' }) };
        }

        const db = await getDb();
        const collection = db.collection('monitors');

        let depth = parseInt(deep_crawl_depth, 10);
        if (isNaN(depth) || depth < 1) depth = 1;
        if (depth > 5) depth = 5;

        let frequency = parseInt(check_frequency, 10);
        if (isNaN(frequency) || frequency < 15) frequency = 1440;

        // Ensure we only update a monitor belonging to the requested user
        const result = await collection.updateOne(
            { _id: new ObjectId(id), user_email: user_email },
            {
                $set: {
                    url,
                    ai_focus_note: ai_focus_note || '',
                    trigger_mode_enabled: !!trigger_mode_enabled,
                    visual_mode_enabled: !!visual_mode_enabled,
                    custom_webhook_url: custom_webhook_url || '',
                    deep_crawl: !!deep_crawl,
                    deep_crawl_depth: depth,
                    check_frequency: frequency,
                    requires_login: !!requires_login,
                    has_captcha: !!has_captcha,
                    username: username || '',
                    password: password || '',
                    captcha_json: captcha_json || null,
                    email_notifications_enabled: !!email_notifications_enabled,
                    telegram_notifications_enabled: !!telegram_notifications_enabled,
                    telegram_chat_id: telegram_chat_id || '',
                    last_updated_timestamp: new Date()
                }
            }
        );

        if (result.matchedCount === 0) {
            return { statusCode: 404, body: JSON.stringify({ error: 'Monitor not found or unauthorized' }) };
        }

        return {
            statusCode: 200,
            body: JSON.stringify({ message: 'Monitor updated successfully' }),
        };
    } catch (error) {
        console.error('Error updating monitor:', error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Internal Server Error' }) };
    }
};
