const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const db = require('./db');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const OpenAI = require('openai');

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // Allow all origins for local dev
        methods: ["GET", "POST"]
    }
});

const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '50mb' })); // Evolution API sends JSON webhooks by default

// Access global IO instance if needed
app.set('io', io);

// Socket.io Connection
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});

// WEBHOOK Endpoint - Receiving events from Evolution API
app.post(['/webhook', '/webhook/*'], async (req, res) => {
    try {
        let events = req.body;

        const fs = require('fs');
        fs.appendFileSync('webhook_debug.log', JSON.stringify(events, null, 2) + '\n---\n');
        console.log('Raw Webhook Body:', JSON.stringify(events, null, 2).substring(0, 500));

        // Normalize to array to handle single or batch events
        if (!Array.isArray(events)) {
            events = [events];
        }

        for (const event of events) {
            if (!event) continue;

            const type = event.type || event.event; // e.g., 'messages.upsert'
            console.log('Processing Webhook Event:', type);

            // --- REAL TIME NOTIFICATION LOGIC ---
            // Emit to all connected clients (React Frontend)
            io.emit('evolution_event', event);

            // --- SAVE MESSAGE LOGIC (RESTORED) ---
            const eventType = type ? type.toLowerCase() : "";

            if (eventType === 'messages.upsert' || eventType === 'send.message') {
                const data = event.data;
                // Handle variation: data might be the message itself or contain a messages array
                let messages = [];
                if (Array.isArray(data)) {
                    messages = data;
                } else if (data.messages) {
                    messages = data.messages;
                } else if (data.key) {
                    // Data IS the message object (User's specific case)
                    messages = [data];
                }

                console.log(`Processing ${messages.length} messages for DB...`);

                for (const msg of messages) {
                    if (!msg.key) continue;

                    const id = msg.key.id;
                    const remoteJid = msg.key.remoteJid;

                    // User Request: Ignore group messages
                    if (remoteJid && remoteJid.includes('@g.us')) {
                        console.log(`Ignoring group message: ${remoteJid}`);
                        continue;
                    }
                    const fromMe = msg.key.fromMe || false;
                    const instanceName = event.instance || 'default';
                    // User Request: push_name only if from_me is false
                    const pushName = !fromMe ? (msg.pushName || null) : null;

                    // Extract content
                    let content = "";
                    let messageType = "unknown";

                    if (msg.message) {
                        if (msg.message.conversation) {
                            content = msg.message.conversation;
                            messageType = "conversation";
                        } else if (msg.message.extendedTextMessage?.text) {
                            content = msg.message.extendedTextMessage.text;
                            messageType = "extendedTextMessage";
                        } else if (msg.message.imageMessage) {
                            content = msg.message.imageMessage.caption || "[Imagem]";
                            messageType = "imageMessage";
                        } else {
                            content = JSON.stringify(msg.message).substring(0, 100); // Fallback
                            messageType = Object.keys(msg.message)[0] || "unknown";
                        }
                    }

                    try {
                        // User Request: created_at with 'America/Sao_Paulo' timezone
                        await db.query(
                            `INSERT INTO messages 
                            (id, remote_jid, instance_name, from_me, content, message_type, push_name, created_at)
                            VALUES ($1, $2, $3, $4, $5, $6, $7, NOW() AT TIME ZONE 'America/Sao_Paulo')
                            ON CONFLICT (id) DO NOTHING`,
                            [id, remoteJid, instanceName, fromMe, content, messageType, pushName]
                        );
                        console.log(`Saved message ${id} to DB.`);

                        // --- UPSERT Contact Logic ---
                        if (!fromMe) {
                            await db.query(`
                                INSERT INTO contacts (remote_jid, instance_name, push_name, last_message_content, last_message_from_me, last_message_created_at)
                                VALUES ($1, $2, $3, $4, $5, NOW() AT TIME ZONE 'America/Sao_Paulo')
                                ON CONFLICT (remote_jid, instance_name) 
                                DO UPDATE SET 
                                    push_name = COALESCE(EXCLUDED.push_name, contacts.push_name), 
                                    last_message_content = EXCLUDED.last_message_content,
                                    last_message_from_me = EXCLUDED.last_message_from_me,
                                    last_message_created_at = EXCLUDED.last_message_created_at,
                                    updated_at = NOW() AT TIME ZONE 'America/Sao_Paulo'
                             `, [remoteJid, instanceName, pushName, content, fromMe]);

                            // Trigger enrichment (profile pic, business status)
                            enrichContactData(instanceName, remoteJid);

                            // Trigger Agent Auto-Reply
                            handleAgentAutoReply(instanceName, remoteJid, content, pushName);
                        } else {
                            // Update last message for sent items
                            await db.query(`
                                INSERT INTO contacts (remote_jid, instance_name, last_message_content, last_message_from_me, last_message_created_at)
                                VALUES ($1, $2, $3, $4, NOW() AT TIME ZONE 'America/Sao_Paulo')
                                ON CONFLICT (remote_jid, instance_name) 
                                DO UPDATE SET 
                                    last_message_content = EXCLUDED.last_message_content,
                                    last_message_from_me = EXCLUDED.last_message_from_me,
                                    last_message_created_at = EXCLUDED.last_message_created_at,
                                    updated_at = NOW() AT TIME ZONE 'America/Sao_Paulo'
                             `, [remoteJid, instanceName, content, fromMe]);

                            // Trigger enrichment even for outgoing messages to catch the contact's name!
                            enrichContactData(instanceName, remoteJid);
                        }
                    } catch (dbErr) {
                        console.error('Failed to save message:', dbErr);
                    }
                }
            }
        }

        res.status(200).send('OK');
    } catch (e) {
        console.error('Webhook error:', e);
        // If headers already sent (rare but possible if multiple res.sends), ignore
        if (!res.headersSent) res.status(500).send('Error');
    }
});

// Endpoint to clear database and notify clients
app.post('/database/clear', async (req, res) => {
    try {
        console.log('Clearing database via API request...');
        await db.query('TRUNCATE TABLE messages, contacts CASCADE');

        io.emit('database_cleared'); // Notify all clients
        console.log('Database cleared and event emitted.');

        res.json({ success: true, message: 'Database cleared' });
    } catch (error) {
        console.error('Error clearing database:', error);
        res.status(500).json({ error: 'Failed to clear database' });
    }
});

// GET /contacts/:instanceName - List unique contacts from DB
app.get('/contacts/:instanceName', async (req, res) => {
    const { instanceName } = req.params;
    try {
        const query = `
            SELECT * FROM contacts 
            WHERE instance_name = $1 
            ORDER BY last_message_created_at DESC NULLS LAST
        `;
        const { rows } = await db.query(query, [instanceName]);
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch contacts' });
    }
});

// GET /messages/:instanceName/:remoteJid - Get history
app.get('/messages/:instanceName/:remoteJid', async (req, res) => {
    const { instanceName, remoteJid } = req.params;
    const limit = parseInt(req.query.limit) || 50;

    try {
        const { rows } = await db.query(
            `SELECT * FROM messages 
             WHERE instance_name = $1 AND remote_jid = $2 
             ORDER BY created_at DESC 
             LIMIT $3`,
            [instanceName, remoteJid, limit]
        );
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch messages' });
    }
});

// GET /hosts - List all saved Evolution API hosts
app.get('/hosts', async (req, res) => {
    try {
        const { rows } = await db.query('SELECT * FROM evolution_hosts ORDER BY created_at DESC');
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /hosts - Save a new host
app.post('/hosts', async (req, res) => {
    const { name, base_url, api_key, webhook_url } = req.body;
    if (!base_url || !api_key) {
        return res.status(400).json({ error: 'Base URL and API Key are required' });
    }
    try {
        const { rows } = await db.query(
            'INSERT INTO evolution_hosts (name, base_url, api_key, status, owner_jid, profile_pic_url, webhook_url) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
            [name || 'Untitled', base_url, api_key, req.body.status, req.body.owner_jid, req.body.profile_pic_url, webhook_url || '']
        );
        res.status(201).json(rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to save host' });
    }
});

// PUT /hosts/:id - Update a host (e.g. webhook_url)
app.put('/hosts/:id', async (req, res) => {
    const { id } = req.params;
    const { name, base_url, api_key, status, owner_jid, profile_pic_url, webhook_url } = req.body;

    try {
        const { rows } = await db.query(
            `UPDATE evolution_hosts 
             SET name = COALESCE($1, name),
                 base_url = COALESCE($2, base_url),
                 api_key = COALESCE($3, api_key),
                 status = COALESCE($4, status),
                 owner_jid = COALESCE($5, owner_jid),
                 profile_pic_url = COALESCE($6, profile_pic_url),
                 webhook_url = COALESCE($7, webhook_url)
             WHERE id = $8
             RETURNING *`,
            [name, base_url, api_key, status, owner_jid, profile_pic_url, webhook_url, id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Host not found' });
        }

        res.json(rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to update host' });
    }
});

// DELETE /hosts/:id - Delete a host
app.delete('/hosts/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await db.query('DELETE FROM evolution_hosts WHERE id = $1', [id]);
        res.status(204).send();
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to delete host' });
    }
});



// Helper to Enrich Contact Data (Profile Pic + Number Status + Name)
async function enrichContactData(instanceName, remoteJid) {
    if (!remoteJid || remoteJid.includes('@g.us')) return; // Skip groups

    try {
        // 1. Get credentials
        const { rows } = await db.query('SELECT base_url, api_key FROM evolution_hosts WHERE name = $1', [instanceName]);
        if (rows.length === 0) return;
        const { base_url, api_key } = rows[0];
        const number = remoteJid.split('@')[0];

        // 2. Fetch Profile (Picture AND Name)
        // Note: URL must NOT have spaces
        const profileRes = await fetch(`${base_url}/chat/fetchProfile/${instanceName}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': api_key },
            body: JSON.stringify({ number })
        });

        let profilePicUrl = null;
        let profileName = null;

        if (profileRes.ok) {
            const pData = await profileRes.json();
            profilePicUrl = pData.picture || null;
            profileName = pData.name || null;
        }

        // 3. Check Number Status (is_business, number_exists)
        // Endpoint: /chat/whatsappNumber/:instance
        const statusRes = await fetch(`${base_url}/chat/whatsappNumber/${instanceName}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': api_key },
            body: JSON.stringify({ numbers: [number] })
        });

        let isBusiness = false;
        let numberExists = true;

        if (statusRes.ok) {
            const sData = await statusRes.json();
            // Expected response: array of objects { exists: true, jid: ..., isBusiness: ... }
            if (Array.isArray(sData) && sData.length > 0) {
                const info = sData[0];
                if (info.exists !== undefined) numberExists = info.exists;
                if (info.isBusiness !== undefined) isBusiness = info.isBusiness; // Check property name (isBusiness vs business)
            }
        }

        // 4. Update Database
        await db.query(`
            UPDATE contacts 
            SET profile_pic_url = COALESCE($1, profile_pic_url),
                push_name = COALESCE($2, push_name), 
                is_business = $3,
                number_exists = $4,
                updated_at = NOW() AT TIME ZONE 'America/Sao_Paulo'
            WHERE remote_jid = $5 AND instance_name = $6
        `, [profilePicUrl, profileName, isBusiness, numberExists, remoteJid, instanceName]);

        // Also update messages table for consistency if we found a name
        if (profileName) {
            await db.query(`
                UPDATE messages SET push_name = $1 
                WHERE remote_jid = $2 AND instance_name = $3
             `, [profileName, remoteJid, instanceName]);
        }

        console.log(`Enriched ${number}: Name=${profileName}, Business=${isBusiness}, Pic=${!!profilePicUrl}`);

        // 5. Emit Socket Event for real-time UI update
        io.emit('contact_update', {
            instance: instanceName,
            remoteJid: remoteJid,
            pushName: profileName,
            profilePicUrl: profilePicUrl
        });

    } catch (err) {
        console.error(`Enrichment failed for ${remoteJid}:`, err.message);
    }
}

// --- AGENTS API ---

// GET /agents
app.get('/agents', async (req, res) => {
    try {
        const { rows } = await db.query('SELECT * FROM agents ORDER BY created_at DESC');
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch agents' });
    }
});

// POST /agents
app.post('/agents', async (req, res) => {
    const { id, name, description, prompt, model, temperature, max_context, is_active, auto_reply, working_hours, keywords, languages, api_key } = req.body;
    try {
        const { rows } = await db.query(`
            INSERT INTO agents (id, name, description, prompt, model, temperature, max_context, is_active, auto_reply, working_hours, keywords, languages, api_key)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            RETURNING *
        `, [id || Date.now().toString(), name, description, prompt, model, temperature, max_context, is_active, auto_reply, working_hours, keywords, languages, api_key]);
        res.status(201).json(rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to create agent' });
    }
});

// PUT /agents/:id
app.put('/agents/:id', async (req, res) => {
    const { id } = req.params;
    const { name, description, prompt, model, temperature, max_context, is_active, auto_reply, working_hours, keywords, languages, api_key } = req.body;
    try {
        const { rows } = await db.query(`
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
        `, [name, description, prompt, model, temperature, max_context, is_active, auto_reply, working_hours, keywords, languages, api_key, id]);
        res.json(rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to update agent' });
    }
});

// DELETE /agents/:id
app.delete('/agents/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await db.query('DELETE FROM agents WHERE id = $1', [id]);
        res.status(204).send();
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to delete agent' });
    }
});

// --- PROXY MESSAGE SENDING (OPTIMISTIC SAVING) ---
app.post('/message/sendText', async (req, res) => {
    const { instanceName, number, text, delay } = req.body;

    if (!instanceName || !number || !text) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        // 1. Fetch Credentials First
        const { rows } = await db.query('SELECT base_url, api_key FROM evolution_hosts WHERE name = $1', [instanceName]);
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Instance not found' });
        }
        const { base_url, api_key } = rows[0];

        // 2. Validate/Normalize Number
        // Strategy: 
        // A. Check if valid contact already exists in OUR DB (Exact or Fuzzy for Brazil)
        // B. Ask Evolution API (Whatsapp) if the number exists

        let remoteJid = `${number}@s.whatsapp.net`;
        let numberToSend = number;
        let finalNumber = number; // The number part of JID

        // Helper for Brazil 9-digit handling (55 + 2 digits DDD + 9 + 8 digits phone)
        const isBrazilMobile = (num) => num.length === 13 && num.startsWith('55') && num[4] === '9';
        const to8Digits = (num) => isBrazilMobile(num) ? (num.substring(0, 4) + num.substring(5)) : num;

        // A. DB Check
        try {
            // Check exact first
            let dbRes = await db.query('SELECT remote_jid FROM contacts WHERE instance_name = $1 AND (remote_jid LIKE $2 OR remote_jid LIKE $3)',
                [instanceName, `${number}%`, `${to8Digits(number)}%`]);

            if (dbRes.rows.length > 0) {
                // If found, prefer the existing JID
                remoteJid = dbRes.rows[0].remote_jid;
                finalNumber = remoteJid.split('@')[0];
                numberToSend = finalNumber; // Send to the 'real' number if found
                console.log(`[PROXY] Found existing contact in DB: ${remoteJid}`);
            } else {
                // B. API Check (If not in DB)
                // Try checking the input number AND the 8-digit version if applicable
                // CRITICAL: Check 8-digit version FIRST. If it exists, use it. This prevents duplicates where API accepts 9-digit but returns 8-digit webhook.
                let numbersToCheck = [];
                if (isBrazilMobile(number)) {
                    numbersToCheck.push(to8Digits(number)); // Priority 1: 8 Digits (Canonical)
                    if (number !== to8Digits(number)) numbersToCheck.push(number); // Priority 2: Original
                } else {
                    numbersToCheck.push(number);
                }

                const checkRes = await fetch(`${base_url}/chat/whatsappNumber/${instanceName}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'apikey': api_key },
                    body: JSON.stringify({ numbers: numbersToCheck })
                });

                if (checkRes.ok) {
                    const checkData = await checkRes.json();
                    if (Array.isArray(checkData)) {
                        // Find the first one that exists
                        const found = checkData.find(x => x.exists);
                        if (found) {
                            // API confirmed existence.
                            // However, for DB storage, we MUST FORCE standard 8-digit JID for Brazil to match Webhooks.
                            // Evolution/WhatsApp often returns 9-digit "exists" but sends events with 8-digit JID.
                            let confirmedJid = found.jid;
                            let confirmedNumber = confirmedJid.split('@')[0];

                            numberToSend = confirmedNumber; // Send to what exists

                            if (isBrazilMobile(confirmedNumber)) {
                                console.log(`[PROXY] Forcing JID to 8 digits for DB consistency: ${confirmedNumber}`);
                                finalNumber = to8Digits(confirmedNumber);
                                remoteJid = `${finalNumber}@s.whatsapp.net`;
                            } else {
                                remoteJid = confirmedJid;
                            }

                            console.log(`[PROXY] Normalized ${number} -> Send: ${numberToSend}, DB: ${remoteJid}`);

                        } else {
                            // STRICT CHECK: If API responded but said "exists: false" for ALL candidates
                            console.warn(`[PROXY] Number ${number} (and variants) not found on WhatsApp.`);
                            return res.status(400).json({ error: 'Número não encontrado no WhatsApp/Evolution API.' });
                        }
                    }
                }
            }
        } catch (checkErr) {
            console.warn('[PROXY] Normalization/DB check failed, using input:', checkErr);
            return res.status(500).json({ error: 'Falha ao verificar número no WhatsApp.' });
        }

        // Final Safety: If API check failed/skipped but we are here (DB found?), ensure consistency one last time
        // If we are about to save a 9-digit BR number as JID, strip it.
        if (remoteJid && remoteJid.includes('@s.whatsapp.net')) {
            let numPart = remoteJid.split('@')[0];
            if (isBrazilMobile(numPart)) {
                remoteJid = `${to8Digits(numPart)}@s.whatsapp.net`;
                console.log(`[PROXY] Forced 8-digit JID safety check: ${remoteJid}`);
            }
        }

        const id = 'SENT-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substring(7).toUpperCase();

        // 3. Optimistic Persistence (Save using NORMALIZED Jid)
        // Note: 'from_me' is always true here.
        await db.query(`
            INSERT INTO messages (id, remote_jid, instance_name, from_me, content, message_type, created_at)
            VALUES ($1, $2, $3, $4, $5, 'conversation', NOW() AT TIME ZONE 'America/Sao_Paulo')
        `, [id, remoteJid, instanceName, true, text]);

        await db.query(`
            INSERT INTO contacts (remote_jid, instance_name, last_message_content, last_message_from_me, last_message_created_at)
            VALUES ($1, $2, $3, $4, NOW() AT TIME ZONE 'America/Sao_Paulo')
            ON CONFLICT (remote_jid, instance_name)
            DO UPDATE SET
                last_message_content = EXCLUDED.last_message_content,
                last_message_from_me = EXCLUDED.last_message_from_me,
                last_message_created_at = EXCLUDED.last_message_created_at,
                updated_at = NOW() AT TIME ZONE 'America/Sao_Paulo'
        `, [remoteJid, instanceName, text, true]);

        console.log(`[PROXY] Optimistically saved message ${id} to ${remoteJid}`);

        // 4. Forward to Evolution API
        // Use Fetch to call the external API
        const response = await fetch(`${base_url}/message/sendText/${instanceName}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': api_key },
            body: JSON.stringify({ number: numberToSend, text, delay: delay || 1200 })
        });

        if (!response.ok) {
            const errText = await response.text();
            console.error(`Evolution API Error: ${errText}`);
            // We return error but the message IS saved. 
            // Ideally we should mark it as failed in DB, but for now let's just warn user.
            return res.status(response.status).json({ error: 'Evolution API failed', details: errText });
        }

        const data = await response.json();
        console.log(`[PROXY] Evolution confirmed send for ${id}`);
        res.json(data);

    } catch (err) {
        console.error('Proxy Send Error:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// --- AI AUTO REPLY LOGIC ---
async function handleAgentAutoReply(instanceName, remoteJid, content, senderName) {
    try {
        // 1. Find active agents (Simplified: matches any agent active)
        const { rows: agents } = await db.query('SELECT * FROM agents WHERE is_active = true AND auto_reply = true');
        if (agents.length === 0) return;

        const agent = agents[0]; // Priority: First one

        // 2. Filter: Keywords
        if (agent.keywords && agent.keywords.length > 0) {
            const hasKeyword = agent.keywords.some(k => content.toLowerCase().includes(k.toLowerCase()));
            if (!hasKeyword) return;
        }

        console.log(`🤖 Agent ${agent.name} triggered for ${remoteJid}`);

        // 3. Context Builder
        const { rows: history } = await db.query(`
            SELECT from_me, content FROM messages 
            WHERE remote_jid = $1 AND instance_name = $2 
            ORDER BY created_at DESC LIMIT $3
        `, [remoteJid, instanceName, agent.max_context]);

        // Reverse to chronological order
        const conversationHistory = history.reverse().map(m => ({
            role: m.from_me ? 'assistant' : 'user',
            content: m.content || ""
        }));

        // 4. Generate Response
        let client = openai;
        if (agent.api_key) {
            client = new OpenAI({ apiKey: agent.api_key });
        }

        const completion = await client.chat.completions.create({
            model: agent.model,
            messages: [
                { role: 'system', content: agent.prompt.replace('{name}', senderName || 'Cliente').replace('{now}', new Date().toLocaleString()) },
                ...conversationHistory
            ],
            temperature: parseFloat(agent.temperature) || 0.7
        });

        const replyText = completion.choices[0].message.content;
        if (!replyText) return;

        // 5. Send Response via Evolution API
        const { rows: hosts } = await db.query('SELECT base_url, api_key FROM evolution_hosts WHERE name = $1', [instanceName]);
        if (hosts.length === 0) {
            console.error("Host not found for auto-reply:", instanceName);
            return;
        }
        const { base_url, api_key } = hosts[0];

        // Delay slightly to feel natural
        setTimeout(async () => {
            await fetch(`${base_url}/message/sendText/${instanceName}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'apikey': api_key },
                body: JSON.stringify({
                    number: remoteJid.split('@')[0],
                    text: replyText,
                    // Optional: delay typing
                })
            });
            console.log(`🤖 Agent replied to ${remoteJid}`);
        }, 1500);

    } catch (e) {
        console.error("Agent Auto-Reply Error:", e);
    }
}

server.listen(port, () => {
    console.log(`Server running with Socket.io on port ${port}`);
});
