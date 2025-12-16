const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const { Client } = require("pg");

const fetchFn =
    global.fetch ||
    ((...args) => import("node-fetch").then(({ default: fetch }) => fetch(...args)));

const db = new Client({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: Number(process.env.DB_PORT || 5432),
});

const EVENTS = ["MESSAGES_UPSERT", "SEND_MESSAGE"];

const normalizeBaseUrl = (url) => String(url || "").replace(/\/$/, "");

async function setWebhookForHost({ name, base_url, api_key, webhook_url }) {
    const instanceName = name;
    const baseUrl = normalizeBaseUrl(base_url);

    const url = `${baseUrl}/webhook/set/${encodeURIComponent(instanceName)}`;

    const payload = {
        enabled: true,
        url: webhook_url,
        webhookByEvents: false,
        webhookBase64: true,
        events: EVENTS,
    };

    const res = await fetchFn(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: api_key },
        body: JSON.stringify(payload),
    });

    const text = await res.text();
    let data;
    try {
        data = text ? JSON.parse(text) : null;
    } catch {
        data = { raw: text };
    }

    if (!res.ok) {
        const msg = data?.message || data?.error || `HTTP ${res.status} ${res.statusText}`;
        const err = new Error(msg);
        err.status = res.status;
        err.details = data;
        throw err;
    }

    return data;
}

async function main() {
    await db.connect();

    const { rows } = await db.query(`
    SELECT name, base_url, api_key, webhook_url
    FROM evolution_hosts
    ORDER BY id ASC
  `);

    if (!rows.length) {
        console.log("Nenhum registro encontrado em evolution_hosts.");
        await db.end();
        return;
    }

    for (const host of rows) {
        const { name, base_url, api_key, webhook_url } = host;

        if (!name || !base_url || !api_key || !webhook_url) {
            console.log(`[SKIP] name=${name || "(null)"} - faltando base_url/api_key/webhook_url`);
            continue;
        }

        try {
            console.log(`\n[${name}] Setting webhook...`);
            const result = await setWebhookForHost(host);
            console.log(`[${name}] OK:`, JSON.stringify(result, null, 2));
        } catch (e) {
            console.error(`[${name}] FAIL: ${e.message}`);
            if (e.details) console.error(`[${name}] Details:`, JSON.stringify(e.details, null, 2));
        }
    }

    await db.end();
}

main().catch((e) => {
    console.error("Fatal:", e);
    process.exitCode = 1;
});
