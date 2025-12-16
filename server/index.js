const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const fs = require("fs");

require("dotenv").config({ path: path.join(__dirname, ".env") });

const db = require("./db");
const OpenAI = require("openai");

const fetchFn =
    global.fetch ||
    ((...args) => import("node-fetch").then(({ default: fetch }) => fetch(...args)));

function nowSP() {
    return "NOW() AT TIME ZONE 'America/Sao_Paulo'";
}

function normalizeBaseUrl(url) {
    return String(url || "").replace(/\/+$/, "");
}

function isGroupJid(remoteJid) {
    return !!remoteJid && remoteJid.includes("@g.us");
}

function safeString(v, max = 5000) {
    const s = (v ?? "").toString();
    return s.length > max ? s.slice(0, max) : s;
}

// -----------------------------
// Normalização BR (remove 9º dígito)
// -----------------------------
function isBrazilMobile9(num) {
    return typeof num === "string" && num.length === 13 && num.startsWith("55") && num[4] === "9";
}
function toBrazil8Digits(num) {
    return isBrazilMobile9(num) ? num.substring(0, 4) + num.substring(5) : num;
}
function jidFromNumber(num) {
    return `${num}@s.whatsapp.net`;
}
function canonicalizeRemoteJid(remoteJid) {
    if (!remoteJid) return remoteJid;
    if (!remoteJid.includes("@s.whatsapp.net")) return remoteJid;
    const num = remoteJid.split("@")[0];
    if (isBrazilMobile9(num)) return jidFromNumber(toBrazil8Digits(num));
    return remoteJid;
}

// -----------------------------
// OpenAI
// -----------------------------
const hasGlobalOpenAI = !!process.env.OPENAI_API_KEY;
const openaiGlobal = hasGlobalOpenAI ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

// -----------------------------
// App + Socket.io
// -----------------------------
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST", "PUT", "DELETE"] },
});

app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.set("io", io);

const port = Number(process.env.PORT || 3001);

io.on("connection", (socket) => {
    console.log("User connected:", socket.id);
    socket.on("disconnect", () => console.log("User disconnected:", socket.id));
});

// -----------------------------
// DB
// -----------------------------
async function getHostByName(instanceName) {
    const { rows } = await db.query(
        `SELECT id, name, base_url, api_key, webhook_url, status, owner_jid, profile_pic_url
     FROM evolution_hosts WHERE name = $1 LIMIT 1`,
        [instanceName]
    );
    return rows[0] || null;
}

async function getHostCreds(instanceName) {
    const host = await getHostByName(instanceName);
    if (!host) return null;
    return { base_url: host.base_url, api_key: host.api_key, webhook_url: host.webhook_url, name: host.name };
}

function buildWebhookUrl(rawWebhookUrl, instanceName) {
    const base = String(rawWebhookUrl || "").trim();
    if (!base) return "";

    const noTrail = base.replace(/\/+$/, "");

    if (noTrail.includes("{instanceName}")) return noTrail.replaceAll("{instanceName}", encodeURIComponent(instanceName));
    if (noTrail.match(/\/webhook\/[^/]+$/)) return noTrail; // já tem /webhook/:inst

    if (noTrail.endsWith("/webhook")) return `${noTrail}/${encodeURIComponent(instanceName)}`;

    if (!noTrail.includes("/webhook")) return `${noTrail}/webhook/${encodeURIComponent(instanceName)}`;

    return `${noTrail}/${encodeURIComponent(instanceName)}`;
}

// -----------------------------
// Evolution API
// -----------------------------
async function evolutionPost({ base_url, api_key }, pathUrl, body) {
    const url = `${normalizeBaseUrl(base_url)}${pathUrl}`;
    const res = await fetchFn(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: api_key },
        body: body ? JSON.stringify(body) : "{}",
    });

    const text = await res.text();
    let data = null;
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

const DEFAULT_WEBHOOK_EVENTS = [
    "APPLICATION_STARTUP",
    "QRCODE_UPDATED",
    "MESSAGES_SET",
    "MESSAGES_UPSERT",
    "MESSAGES_UPDATE",
    "MESSAGES_DELETE",
    "SEND_MESSAGE",
    "CONTACTS_SET",
    "CONTACTS_UPSERT",
    "CONTACTS_UPDATE",
    "PRESENCE_UPDATE",
    "CHATS_SET",
    "CHATS_UPSERT",
    "CHATS_UPDATE",
    "CHATS_DELETE",
    "GROUPS_UPSERT",
    "GROUP_UPDATE",
    "GROUP_PARTICIPANTS_UPDATE",
    "CONNECTION_UPDATE",
    "LABELS_EDIT",
    "LABELS_ASSOCIATION",
    "CALL",
    "TYPEBOT_START",
    "TYPEBOT_CHANGE_STATUS",
];

// Formato EXATO do set webhook
async function setEvolutionWebhookForInstance(instanceName, events = DEFAULT_WEBHOOK_EVENTS, extraHeaders = {}) {
    const host = await getHostByName(instanceName);
    if (!host || !host.base_url || !host.api_key || !host.webhook_url) return null;

    const creds = { base_url: host.base_url, api_key: host.api_key };
    const finalUrl = buildWebhookUrl(host.webhook_url, instanceName);

    return evolutionPost(creds, `/webhook/set/${encodeURIComponent(instanceName)}`, {
        webhook: {
            enabled: true,
            url: finalUrl,
            headers: extraHeaders,
            byEvents: false,
            base64: false,
            events,
        },
    });
}

// -----------------------------
// Webhook parser
// -----------------------------
function normalizeEventType(rawType) {
    const raw = String(rawType || "").trim();
    return raw.toLowerCase().replace(/_/g, ".");
}

function extractMessagesFromWebhookEvent(event) {
    const type = normalizeEventType(event?.type || event?.event);

    const data = event?.data;
    let messages = [];

    if (Array.isArray(data)) messages = data;
    else if (data?.messages && Array.isArray(data.messages)) messages = data.messages;
    else if (data?.key) messages = [data];
    else if (event?.key) messages = [event];

    return { type, messages };
}

function extractContentAndType(msg) {
    let content = "";
    let messageType = "unknown";
    let mediaUrl = null;

    const m = msg?.message;
    if (!m) return { content: "", messageType: "unknown", mediaUrl: null };

    if (m.conversation) {
        content = m.conversation;
        messageType = "conversation";
    } else if (m.extendedTextMessage?.text) {
        content = m.extendedTextMessage.text;
        messageType = "extendedTextMessage";
    } else if (m.imageMessage) {
        content = m.imageMessage.caption || "[Imagem]";
        messageType = "imageMessage";
        mediaUrl = m.imageMessage.url || null;
    } else if (m.videoMessage) {
        content = m.videoMessage.caption || "[Vídeo]";
        messageType = "videoMessage";
        mediaUrl = m.videoMessage.url || null;
    } else if (m.documentMessage) {
        content = m.documentMessage.fileName || "[Documento]";
        messageType = "documentMessage";
        mediaUrl = m.documentMessage.url || null;
    } else {
        const key = Object.keys(m)[0] || "unknown";
        messageType = key;
        content = safeString(JSON.stringify(m), 200);
    }

    return { content: safeString(content, 5000), messageType, mediaUrl };
}

// -----------------------------
// Enriquecimento contato
// -----------------------------
async function enrichContactData(instanceName, remoteJid) {
    if (!remoteJid || isGroupJid(remoteJid)) return;

    try {
        const creds = await getHostCreds(instanceName);
        if (!creds) return;

        const { base_url, api_key } = creds;
        const number = remoteJid.split("@")[0];

        let profilePicUrl = null;
        let profileName = null;

        try {
            const profile = await evolutionPost(
                { base_url, api_key },
                `/chat/fetchProfile/${encodeURIComponent(instanceName)}`,
                { number }
            );
            profilePicUrl = profile?.picture || null;
            profileName = profile?.name || null;
        } catch { }

        let isBusiness = false;
        let numberExists = true;

        try {
            const status = await evolutionPost(
                { base_url, api_key },
                `/chat/whatsappNumber/${encodeURIComponent(instanceName)}`,
                { numbers: [number] }
            );

            if (Array.isArray(status) && status.length > 0) {
                const info = status[0];
                if (typeof info.exists === "boolean") numberExists = info.exists;
                if (typeof info.isBusiness === "boolean") isBusiness = info.isBusiness;
            }
        } catch { }

        await db.query(
            `
      UPDATE contacts
      SET profile_pic_url = COALESCE($1, profile_pic_url),
          push_name = COALESCE($2, push_name),
          is_business = $3,
          number_exists = $4,
          updated_at = ${nowSP()}
      WHERE remote_jid = $5 AND instance_name = $6
      `,
            [profilePicUrl, profileName, isBusiness, numberExists, remoteJid, instanceName]
        );

        if (profileName) {
            await db.query(
                `UPDATE messages SET push_name = $1 WHERE remote_jid = $2 AND instance_name = $3`,
                [profileName, remoteJid, instanceName]
            );
        }

        io.emit("contact_update", {
            instance: instanceName,
            remoteJid,
            pushName: profileName,
            profilePicUrl,
            isBusiness,
            numberExists,
        });
    } catch (err) {
        console.error(`Enrichment failed for ${remoteJid} (${instanceName}):`, err.message);
    }
}

// -----------------------------
// Agente responde
// -----------------------------
async function handleAgentAutoReply(instanceName, remoteJid, content, senderName) {
    try {
        const { rows: agents } = await db.query(
            `SELECT * FROM agents WHERE is_active = true AND auto_reply = true ORDER BY created_at DESC`
        );
        if (!agents.length) return;

        const agent = agents[0];

        if (Array.isArray(agent.keywords) && agent.keywords.length > 0) {
            const text = (content || "").toLowerCase();
            const ok = agent.keywords.some((k) => text.includes(String(k).toLowerCase()));
            if (!ok) return;
        }

        const apiKey = agent.api_key || process.env.OPENAI_API_KEY;
        if (!apiKey) return;

        const client = agent.api_key ? new OpenAI({ apiKey: agent.api_key }) : openaiGlobal;
        if (!client) return;

        const maxContext = Number(agent.max_context || 10);
        const { rows: history } = await db.query(
            `SELECT from_me, content
       FROM messages
       WHERE remote_jid = $1 AND instance_name = $2
       ORDER BY created_at DESC
       LIMIT $3`,
            [remoteJid, instanceName, maxContext]
        );

        const conversationHistory = history
            .slice()
            .reverse()
            .map((m) => ({
                role: m.from_me ? "assistant" : "user",
                content: m.content || "",
            }));

        const systemPrompt = String(agent.prompt || "")
            .replace("{name}", senderName || "Cliente")
            .replace("{now}", new Date().toLocaleString("pt-BR"));

        const completion = await client.chat.completions.create({
            model: agent.model || "gpt-3.5-turbo",
            messages: [{ role: "system", content: systemPrompt }, ...conversationHistory],
            temperature: Number(agent.temperature ?? 0.7),
        });

        const replyText = completion?.choices?.[0]?.message?.content;
        if (!replyText) return;

        const creds = await getHostCreds(instanceName);
        if (!creds) return;

        const number = remoteJid.split("@")[0];

        setTimeout(async () => {
            try {
                await evolutionPost(
                    { base_url: creds.base_url, api_key: creds.api_key },
                    `/message/sendText/${encodeURIComponent(instanceName)}`,
                    { number, text: replyText }
                );
            } catch (e) {
                console.error("Agent send failed:", e.message);
            }
        }, 1200);
    } catch (e) {
        console.error("Agent Auto-Reply Error:", e.message);
    }
}

async function processWebhookEvents(instanceName, body, res) {
    const host = await getHostByName(instanceName);
    if (!host) return res.status(404).json({ error: `Unknown instanceName: ${instanceName}` });

    let events = body;

    if (process.env.WEBHOOK_DEBUG === "1") {
        try {
            fs.appendFileSync("webhook_debug.log", JSON.stringify(events, null, 2) + "\n---\n");
        } catch { }
    }

    if (!Array.isArray(events)) events = [events];

    for (const event of events) {
        if (!event) continue;

        io.emit("evolution_event", { ...event, instance: instanceName });

        const { type, messages } = extractMessagesFromWebhookEvent(event);

        if (type !== "messages.upsert" && type !== "send.message") continue;

        for (const msg of messages) {
            if (!msg?.key) continue;

            const id = msg.key.id;
            let remoteJid = msg.key.remoteJid;

            if (!remoteJid || isGroupJid(remoteJid)) continue;

            // normaliza BR (9º dígito)
            remoteJid = canonicalizeRemoteJid(remoteJid);

            const fromMe = !!msg.key.fromMe;
            const pushName = !fromMe ? (msg.pushName || null) : null;

            const { content, messageType, mediaUrl } = extractContentAndType(msg);

            await db.query(
                `
        INSERT INTO messages
          (id, remote_jid, instance_name, from_me, content, media_url, message_type, push_name, created_at)
        VALUES
          ($1,$2,$3,$4,$5,$6,$7,$8, ${nowSP()})
        ON CONFLICT (id) DO NOTHING
        `,
                [id, remoteJid, instanceName, fromMe, content, mediaUrl, messageType, pushName]
            );

            await db.query(
                `
        INSERT INTO contacts
          (remote_jid, instance_name, push_name, last_message_content, last_message_from_me, last_message_created_at)
        VALUES
          ($1,$2,$3,$4,$5, ${nowSP()})
        ON CONFLICT (remote_jid, instance_name)
        DO UPDATE SET
          push_name = COALESCE(EXCLUDED.push_name, contacts.push_name),
          last_message_content = EXCLUDED.last_message_content,
          last_message_from_me = EXCLUDED.last_message_from_me,
          last_message_created_at = EXCLUDED.last_message_created_at,
          updated_at = ${nowSP()}
        `,
                [remoteJid, instanceName, pushName, content, fromMe]
            );

            enrichContactData(instanceName, remoteJid);
            if (!fromMe) handleAgentAutoReply(instanceName, remoteJid, content, pushName);
        }
    }

    return res.status(200).send("OK");
}

// -----------------------------
// ROTAS WEBHOOK
// -----------------------------
app.post("/webhook/:instanceName", async (req, res) => {
    try {
        return await processWebhookEvents(req.params.instanceName, req.body, res);
    } catch (e) {
        console.error("Webhook error:", e);
        if (!res.headersSent) res.status(500).send("Error");
    }
});

function inferInstanceNameFromBody(body) {
    const arr = Array.isArray(body) ? body : [body];
    for (const ev of arr) {
        if (!ev) continue;
        const cand =
            ev.instance ||
            ev.instanceName ||
            ev?.data?.instance ||
            ev?.data?.instanceName ||
            ev?.webhook?.instance;
        if (cand) return String(cand);
    }
    return null;
}

app.post("/webhook", async (req, res) => {
    try {
        const instanceName =
            (req.query.instanceName ? String(req.query.instanceName) : null) ||
            inferInstanceNameFromBody(req.body);

        if (!instanceName) {
            return res.status(400).json({
                error:
                    "Não foi possível identificar a instance. Configure a Evolution para chamar /webhook/:instanceName OU envie `instance` no body.",
            });
        }

        return await processWebhookEvents(instanceName, req.body, res);
    } catch (e) {
        console.error("Webhook error:", e);
        if (!res.headersSent) res.status(500).send("Error");
    }
});

// -----------------------------
// LIMPAR BANCO DE DADOS
// -----------------------------
app.post("/database/clear", async (req, res) => {
    try {
        await db.query("TRUNCATE TABLE messages, contacts CASCADE");
        io.emit("database_cleared");
        res.json({ success: true, message: "Database cleared" });
    } catch (error) {
        console.error("Error clearing database:", error);
        res.status(500).json({ error: "Failed to clear database" });
    }
});

// -----------------------------
// CONTATOS / MENSAGENS
// -----------------------------
app.get("/contacts/:instanceName", async (req, res) => {
    const { instanceName } = req.params;
    try {
        const { rows } = await db.query(
            `
      SELECT *
      FROM contacts
      WHERE instance_name = $1
      ORDER BY last_message_created_at DESC NULLS LAST
      `,
            [instanceName]
        );
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to fetch contacts" });
    }
});

app.get("/messages/:instanceName/:remoteJid", async (req, res) => {
    const { instanceName, remoteJid } = req.params;
    const limit = Number.parseInt(req.query.limit, 10) || 50;

    try {
        const { rows } = await db.query(
            `
      SELECT *
      FROM messages
      WHERE instance_name = $1 AND remote_jid = $2
      ORDER BY created_at DESC
      LIMIT $3
      `,
            [instanceName, remoteJid, limit]
        );
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to fetch messages" });
    }
});

// -----------------------------
// INSTANCIAS
// -----------------------------
app.get("/hosts", async (req, res) => {
    try {
        const { rows } = await db.query("SELECT * FROM evolution_hosts ORDER BY created_at DESC");
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Internal server error" });
    }
});

app.post("/hosts", async (req, res) => {
    const { name, base_url, api_key, webhook_url, status, owner_jid, profile_pic_url } = req.body;

    if (!name || !base_url || !api_key) {
        return res.status(400).json({ error: "name, base_url and api_key are required" });
    }

    try {
        const { rows } = await db.query(
            `
      INSERT INTO evolution_hosts
        (name, base_url, api_key, status, owner_jid, profile_pic_url, webhook_url)
      VALUES
        ($1,$2,$3,$4,$5,$6,$7)
      RETURNING *
      `,
            [name, base_url, api_key, status || null, owner_jid || null, profile_pic_url || null, webhook_url || ""]
        );

        // aplica webhook automaticamente (se webhook_url foi informado)
        if (webhook_url) {
            setEvolutionWebhookForInstance(name).catch((e) =>
                console.error(`[hosts] webhook apply failed for ${name}:`, e.message)
            );
        }

        res.status(201).json(rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to save host" });
    }
});

app.put("/hosts/:id", async (req, res) => {
    const { id } = req.params;
    const { name, base_url, api_key, webhook_url, status, owner_jid, profile_pic_url } = req.body;

    try {
        const { rows } = await db.query(
            `
      UPDATE evolution_hosts
      SET name = COALESCE($1, name),
          base_url = COALESCE($2, base_url),
          api_key = COALESCE($3, api_key),
          webhook_url = COALESCE($4, webhook_url),
          status = COALESCE($5, status),
          owner_jid = COALESCE($6, owner_jid),
          profile_pic_url = COALESCE($7, profile_pic_url)
      WHERE id = $8
      RETURNING *
      `,
            [name, base_url, api_key, webhook_url, status, owner_jid, profile_pic_url, id]
        );

        if (!rows.length) return res.status(404).json({ error: "Host not found" });

        const updated = rows[0];
        if (updated.webhook_url && updated.name) {
            setEvolutionWebhookForInstance(updated.name).catch((e) =>
                console.error(`[hosts] webhook re-apply failed for ${updated.name}:`, e.message)
            );
        }

        res.json(updated);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to update host" });
    }
});

app.delete("/hosts/:id", async (req, res) => {
    const { id } = req.params;
    try {
        await db.query("DELETE FROM evolution_hosts WHERE id = $1", [id]);
        res.status(204).send();
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to delete host" });
    }
});

// -----------------------------
// CRIAR AGENTES
// -----------------------------
app.get("/agents", async (req, res) => {
    try {
        const { rows } = await db.query("SELECT * FROM agents ORDER BY created_at DESC");
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to fetch agents" });
    }
});

app.post("/agents", async (req, res) => {
    const {
        id, name, description, prompt, model, temperature,
        max_context, is_active, auto_reply, working_hours,
        keywords, languages, api_key
    } = req.body;

    if (!name || !prompt) return res.status(400).json({ error: "name and prompt are required" });

    try {
        const { rows } = await db.query(
            `
      INSERT INTO agents
        (id, name, description, prompt, model, temperature, max_context, is_active, auto_reply, working_hours, keywords, languages, api_key)
      VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      RETURNING *
      `,
            [
                id || Date.now().toString(),
                name,
                description || "",
                prompt,
                model || "gpt-3.5-turbo",
                temperature ?? 0.7,
                max_context ?? 10,
                is_active ?? true,
                auto_reply ?? false,
                working_hours || null,
                keywords || [],
                languages || ["pt-BR"],
                api_key || null,
            ]
        );

        res.status(201).json(rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to create agent" });
    }
});

app.put("/agents/:id", async (req, res) => {
    const { id } = req.params;
    const {
        name, description, prompt, model, temperature,
        max_context, is_active, auto_reply, working_hours,
        keywords, languages, api_key
    } = req.body;

    try {
        const { rows } = await db.query(
            `
      UPDATE agents SET
        name = COALESCE($1, name),
        description = COALESCE($2, description),
        prompt = COALESCE($3, prompt),
        model = COALESCE($4, model),
        temperature = COALESCE($5, temperature),
        max_context = COALESCE($6, max_context),
        is_active = COALESCE($7, is_active),
        auto_reply = COALESCE($8, auto_reply),
        working_hours = COALESCE($9, working_hours),
        keywords = COALESCE($10, keywords),
        languages = COALESCE($11, languages),
        api_key = COALESCE($12, api_key)
      WHERE id = $13
      RETURNING *
      `,
            [name, description, prompt, model, temperature, max_context, is_active, auto_reply, working_hours, keywords, languages, api_key, id]
        );

        if (!rows.length) return res.status(404).json({ error: "Agent not found" });
        res.json(rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to update agent" });
    }
});

app.delete("/agents/:id", async (req, res) => {
    const { id } = req.params;
    try {
        await db.query("DELETE FROM agents WHERE id = $1", [id]);
        res.status(204).send();
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to delete agent" });
    }
});

// -----------------------------
// sendText (com normalização 9º dígito)
// -----------------------------
app.post("/message/sendText", async (req, res) => {
    const { instanceName, number, text, delay } = req.body;

    if (!instanceName || !number || !text) {
        return res.status(400).json({ error: "Missing required fields" });
    }

    try {
        const creds = await getHostCreds(instanceName);
        if (!creds) return res.status(404).json({ error: "Instance not found" });

        const base_url = creds.base_url;
        const api_key = creds.api_key;

        // A) Normalização Brasil
        let numberInput = String(number).replace(/\D/g, "");
        let remoteJid = jidFromNumber(numberInput);
        let numberToSend = numberInput;

        // 1) tenta achar no DB (número ou variante 8 dígitos)
        try {
            const eight = toBrazil8Digits(numberInput);
            const { rows: dbRes } = await db.query(
                `SELECT remote_jid
         FROM contacts
         WHERE instance_name = $1
           AND (remote_jid LIKE $2 OR remote_jid LIKE $3)
         LIMIT 1`,
                [instanceName, `${numberInput}%`, `${eight}%`]
            );

            if (dbRes.length > 0) {
                remoteJid = canonicalizeRemoteJid(dbRes[0].remote_jid);
                numberToSend = remoteJid.split("@")[0];
                console.log(`[PROXY] Found existing contact in DB: ${remoteJid}`);
            } else {
                // 2) se não achou, valida na Evolution (prioriza 8 dígitos)
                const numbersToCheck = [];
                if (isBrazilMobile9(numberInput)) {
                    const eightCandidate = toBrazil8Digits(numberInput);
                    numbersToCheck.push(eightCandidate);
                    if (numberInput !== eightCandidate) numbersToCheck.push(numberInput);
                } else {
                    numbersToCheck.push(numberInput);
                }

                const check = await evolutionPost(
                    { base_url, api_key },
                    `/chat/whatsappNumber/${encodeURIComponent(instanceName)}`,
                    { numbers: numbersToCheck }
                );

                if (Array.isArray(check)) {
                    const found = check.find((x) => x && x.exists);
                    if (!found) {
                        console.warn(`[PROXY] Number ${numberInput} (and variants) not found on WhatsApp.`);
                        return res.status(400).json({ error: "Número não encontrado no WhatsApp/Evolution API." });
                    }

                    const confirmedJid = found.jid || jidFromNumber(numbersToCheck[0]);
                    const confirmedNumber = confirmedJid.split("@")[0];

                    numberToSend = confirmedNumber;

                    // força 8 dígitos no DB se for BR 9
                    if (isBrazilMobile9(confirmedNumber)) {
                        remoteJid = jidFromNumber(toBrazil8Digits(confirmedNumber));
                    } else {
                        remoteJid = confirmedJid;
                    }

                    remoteJid = canonicalizeRemoteJid(remoteJid);

                    console.log(`[PROXY] Normalized ${numberInput} -> Send: ${numberToSend}, DB: ${remoteJid}`);
                }
            }
        } catch (e) {
            console.warn("[PROXY] Normalization check failed:", e.message);
            return res.status(500).json({ error: "Falha ao verificar número no WhatsApp." });
        }

        remoteJid = canonicalizeRemoteJid(remoteJid);

        const id =
            "SENT-" +
            Date.now().toString(36).toUpperCase() +
            Math.random().toString(36).slice(2).toUpperCase();

        await db.query(
            `
      INSERT INTO messages (id, remote_jid, instance_name, from_me, content, message_type, created_at)
      VALUES ($1,$2,$3,$4,$5,'conversation', ${nowSP()})
      ON CONFLICT (id) DO NOTHING
      `,
            [id, remoteJid, instanceName, true, safeString(text, 5000)]
        );

        await db.query(
            `
      INSERT INTO contacts (remote_jid, instance_name, last_message_content, last_message_from_me, last_message_created_at)
      VALUES ($1,$2,$3,$4, ${nowSP()})
      ON CONFLICT (remote_jid, instance_name)
      DO UPDATE SET
        last_message_content = EXCLUDED.last_message_content,
        last_message_from_me = EXCLUDED.last_message_from_me,
        last_message_created_at = EXCLUDED.last_message_created_at,
        updated_at = ${nowSP()}
      `,
            [remoteJid, instanceName, safeString(text, 5000), true]
        );

        // C) Envia na Evolution
        const data = await evolutionPost(
            { base_url, api_key },
            `/message/sendText/${encodeURIComponent(instanceName)}`,
            { number: numberToSend, text, delay: delay || 1200 }
        );

        res.json(data);
    } catch (err) {
        console.error("Proxy Send Error:", err.message);
        res.status(500).json({ error: "Internal Server Error", details: err.message });
    }
});

// -----------------------------
// FRONTEND ESTÁTICO (prod/dev)
// -----------------------------
const distPath = path.join(__dirname, "../dist");
const publicPath = path.join(__dirname, "public");

if (fs.existsSync(path.join(publicPath, "index.html"))) {
    console.log(`Serving static files from ${publicPath}`);
    app.use(express.static(publicPath));
    app.get("*", (req, res) => res.sendFile(path.join(publicPath, "index.html")));
} else if (fs.existsSync(path.join(distPath, "index.html"))) {
    console.log(`Serving static files from ${distPath}`);
    app.use(express.static(distPath));
    app.get("*", (req, res) => res.sendFile(path.join(distPath, "index.html")));
} else {
    console.warn("No static frontend found in 'public' or '../dist'.");
}

// -----------------------------
// INICIO
// -----------------------------
(async () => {
    try {
        if (db.ready) await db.ready;
    } catch (e) {
        console.error("DB init failed:", e.message);
        process.exit(1);
    }

    server.listen(port, () => {
        console.log(`Server running with Socket.io on port ${port}`);
        console.log(`Webhook: POST /webhook/:instanceName OR POST /webhook (with body.instance)`);
    });
})();