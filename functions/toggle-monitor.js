const { getDb } = require('./utils/db');
const { ObjectId } = require('mongodb');

exports.handler = async (event, context) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const { id, admin_email, is_paused } = JSON.parse(event.body);
        const systemAdminEmail = process.env.ADMIN_GMAIL;

        if (!systemAdminEmail || admin_email.toLowerCase() !== systemAdminEmail.toLowerCase()) {
            return { statusCode: 403, body: JSON.stringify({ error: 'Unauthorized.' }) };
        }

        if (!id) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Monitor ID is required' }) };
        }

        const db = await getDb();
        const collection = db.collection('monitors');

        const result = await collection.updateOne(
            { _id: new ObjectId(id) },
            {
                $set: {
                    is_paused: !!is_paused,
                    last_updated_timestamp: new Date()
                }
            }
        );

        if (result.matchedCount === 0) {
            return { statusCode: 404, body: JSON.stringify({ error: 'Monitor not found' }) };
        }

        return {
            statusCode: 200,
            body: JSON.stringify({ message: `Monitor pause state updated to ${!!is_paused}` }),
        };
    } catch (error) {
        console.error('Error toggling monitor:', error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Internal Server Error' }) };
    }
};
