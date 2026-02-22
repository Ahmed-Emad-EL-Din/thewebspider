const { getDb } = require('./utils/db');

exports.handler = async (event, context) => {
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const { email } = event.queryStringParameters;
    const adminEmail = process.env.ADMIN_GMAIL;

    if (!adminEmail || email.toLowerCase() !== adminEmail.toLowerCase()) {
        return { statusCode: 403, body: JSON.stringify({ error: 'Unauthorized.' }) };
    }

    try {
        const db = await getDb();
        const collection = db.collection('monitors');

        // Fetch ALL monitors
        const monitors = await collection.find({}).toArray();

        // Calculate Stats
        const uniqueUsers = new Set();
        let totalFailedRuns = 0;

        monitors.forEach(m => {
            if (m.user_email) uniqueUsers.add(m.user_email);
            if (m.last_run_status === 'failed') totalFailedRuns++;
        });

        const stats = {
            total_users: uniqueUsers.size,
            total_monitors: monitors.length,
            total_failed_runs: totalFailedRuns,
            monitors: monitors // Send full list back for the table
        };

        return {
            statusCode: 200,
            body: JSON.stringify(stats),
        };
    } catch (error) {
        console.error('Error fetching admin stats:', error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Internal Server Error' }) };
    }
};
