const { MongoClient } = require('mongodb');

exports.handler = async (event, context) => {
    // Only allow POST to easily parse the user email body without URL params
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const { user_email } = JSON.parse(event.body);

        if (!user_email) {
            return { statusCode: 400, body: JSON.stringify({ error: 'User email is required' }) };
        }

        const client = new MongoClient(process.env.MONGO_URI);
        await client.connect();
        const db = client.db('thewebspider');
        const alertsCol = db.collection('alerts');

        // Fetch any alerts where target is explicitly the user, or ALL
        // and is_active is true.
        const alerts = await alertsCol.find({
            $or: [
                { target_email: 'ALL' },
                { target_email: user_email }
            ],
            is_active: true
        }).toArray();

        await client.close();

        return {
            statusCode: 200,
            body: JSON.stringify(alerts),
        };
    } catch (error) {
        console.error("Error fetching alerts:", error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Failed to fetch alerts' }) };
    }
};
