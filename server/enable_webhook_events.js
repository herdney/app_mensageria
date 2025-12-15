const { Client } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const client = new Client({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

async function enableEvents() {
    try {
        await client.connect();

        const { rows } = await client.query("SELECT base_url, api_key, webhook_url FROM evolution_hosts WHERE name = $1");
        if (rows.length === 0) {
            return;
        }
        const { base_url, api_key, webhook_url } = rows[0];
        console.log(`URL: ${webhook_url}`);

        const response = await fetch(`${base_url}/webhook/set/INSTANCE_NAME`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': api_key
            },
            body: JSON.stringify({
                "webhook": {
                    "enabled": true,
                    "url": webhook_url,
                    "webhookByEvents": false,
                    "events": [
                        "MESSAGES_UPSERT",
                        "SEND_MESSAGE"
                    ]
                }
            })
        });

        if (response.ok) {
            const data = await response.json();
            console.log("Success:", JSON.stringify(data, null, 2));
        } else {
            console.log("Error:", response.status, response.statusText);
            const text = await response.text();
            console.log("Body:", text);
        }

    } catch (err) {
        console.error(err);
    } finally {
        await client.end();
    }
}

enableEvents();
