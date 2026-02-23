exports.handler = async (event, context) => {
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const { email } = event.queryStringParameters;

    if (!email) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Email parameter is required' }) };
    }

    const adminEmail = process.env.ADMIN_GMAIL;
    const hardcodedAdmin = 'mr.electron1915@gmail.com';

    // Check if the provided email matches either the environment variable OR the hardcoded owner email
    const isAdmin = (adminEmail && email.toLowerCase() === adminEmail.toLowerCase()) ||
        (email.toLowerCase() === hardcodedAdmin.toLowerCase());

    return {
        statusCode: 200,
        body: JSON.stringify({ is_admin: isAdmin }),
    };
};
