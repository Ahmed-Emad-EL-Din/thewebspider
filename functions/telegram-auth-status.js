const { MongoClient } = require('mongodb');

let cachedClient = null;

async function connectToDatabase() {
    if (cachedClient) {
        return cachedClient.db('webwatcher');
    }
    const client = new MongoClient(process.env.MONGO_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
    });
    await client.connect();
    cachedClient = client;
    return client.db('webwatcher');
}

exports.handler = async (event, context) => {
    // Only allow GET requests
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const { token } = event.queryStringParameters;

    if (!token) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Token is required' }) };
    }

    try {
        const db = await connectToDatabase();
        const tokensCollection = db.collection('telegram_tokens');

        // Check if token exists
        const tokenDoc = await tokensCollection.findOne({ token: token });

        if (tokenDoc) {
            // Token found, chat_id has been captured by the webhook!
            // Clean up by deleting the token so it can't be reused
            await tokensCollection.deleteOne({ _id: tokenDoc._id });

            return {
                statusCode: 200,
                body: JSON.stringify({ status: 'success', chat_id: tokenDoc.chat_id })
            };
        } else {
            // Token not found yet, user hasn't clicked Start or webhook hasn't processed it
            return {
                statusCode: 200,
                body: JSON.stringify({ status: 'pending' })
            };
        }

    } catch (error) {
        console.error('Database connection error:', error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Failed to connect to database' }) };
    }
};
