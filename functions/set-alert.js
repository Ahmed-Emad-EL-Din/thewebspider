const { MongoClient } = require('mongodb');

exports.handler = async (event, context) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const { admin_email, target_email, message, is_active } = JSON.parse(event.body);

        if (admin_email !== 'mr.electron1915@gmail.com') {
            return { statusCode: 403, body: JSON.stringify({ error: 'Unauthorized. Admin access required.' }) };
        }

        if (!message || message.trim() === '') {
            return { statusCode: 400, body: JSON.stringify({ error: 'Message cannot be empty.' }) };
        }

        const client = new MongoClient(process.env.MONGO_URI);
        await client.connect();
        const db = client.db('thewebspider');
        const alertsCol = db.collection('alerts');

        // Upsert the alert
        // target_email will be either an explicit user email, or "ALL" for global alerts.
        await alertsCol.updateOne(
            { target_email: target_email || 'ALL' },
            {
                $set: {
                    message: message,
                    is_active: is_active !== false, // default true
                    updated_at: new Date()
                }
            },
            { upsert: true }
        );

        await client.close();

        return {
            statusCode: 200,
            body: JSON.stringify({ message: 'Alert configured successfully' }),
        };
    } catch (error) {
        console.error("Error setting alert:", error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Failed to set alert' }) };
    }
};
