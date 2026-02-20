const nodemailer = require('nodemailer');

exports.handler = async (event, context) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const providedSecret = event.headers.authorization || event.headers.Authorization;
        const expectedSecret = `Bearer ${process.env.WEBHOOK_SECRET}`;

        if (process.env.WEBHOOK_SECRET && providedSecret !== expectedSecret) {
            console.warn("Unauthorized webhook attempt");
            return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
        }

        const { monitor, summary } = JSON.parse(event.body);
        const { url, user_email, email_notifications_enabled, telegram_notifications_enabled, telegram_chat_id } = monitor;

        const results = [];

        // 1. Handle Email via Netlify
        if (email_notifications_enabled) {
            const transporter = nodemailer.createTransport({
                host: process.env.EMAIL_HOST,
                port: process.env.EMAIL_PORT,
                secure: process.env.EMAIL_PORT == 465,
                auth: {
                    user: process.env.EMAIL_HOST_USER,
                    pass: process.env.EMAIL_HOST_PASSWORD,
                },
            });

            const mailOptions = {
                from: `"TheWebspider Service" <${process.env.EMAIL_HOST_USER}>`,
                to: user_email,
                subject: `🚨 Change Detected: ${url}`,
                text: `Thethewebspiders has detected significant changes on the page: ${url}\n\nAI Summary:\n${summary}\n\nCheck your dashboard for details.`,
            };

            try {
                await transporter.sendMail(mailOptions);
                results.push('Email sent successfully');
            } catch (err) {
                console.error('Email error:', err);
                results.push(`Email failed: ${err.message}`);
            }
        }

        // 2. Handle Telegram via Netlify
        if (telegram_notifications_enabled && telegram_chat_id) {
            const botToken = process.env.TELEGRAM_BOT_TOKEN;
            const telegramUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;

            const message = `🚨 TheWebspider Update\n\nPage: ${url}\n\nAI Summary:\n${summary}`;

            try {
                const response = await fetch(telegramUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chat_id: telegram_chat_id,
                        text: message
                    })
                });

                if (response.ok) {
                    results.push('Telegram message sent successfully');
                } else {
                    const errorData = await response.json();
                    results.push(`Telegram failed: ${errorData.description}`);
                }
            } catch (err) {
                console.error('Telegram error:', err);
                results.push(`Telegram failed: ${err.message}`);
            }
        }

        return {
            statusCode: 200,
            body: JSON.stringify({ message: 'Notifications processed', results }),
        };
    } catch (error) {
        console.error('Notification function error:', error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Internal Server Error' }) };
    }
};
