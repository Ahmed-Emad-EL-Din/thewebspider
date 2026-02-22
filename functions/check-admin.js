exports.handler = async (event, context) => {
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const { email } = event.queryStringParameters;

    if (!email) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Email parameter is required' }) };
    }

    const adminEmail = process.env.ADMIN_GMAIL;

    // Check if the provided email matches the environment variable Exactly
    const isAdmin = adminEmail && email.toLowerCase() === adminEmail.toLowerCase();

    return {
        statusCode: 200,
        body: JSON.stringify({ is_admin: isAdmin }),
    };
};
