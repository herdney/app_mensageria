const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const { Pool, Client } = require("pg");

const dbConfig = {
    user: process.env.DB_USER || "postgres",
    host: process.env.DB_HOST || "localhost",
    database: process.env.DB_NAME || "mensageria",
    password: process.env.DB_PASSWORD || "postgres",
    port: Number(process.env.DB_PORT || 5432),
};

let pool;

function escapeIdent(name) {
    return `"${String(name).replace(/"/g, '""')}"`;
}

async function createDatabaseIfNotExists() {
    const admin = new Client({
        user: dbConfig.user,
        host: dbConfig.host,
        password: dbConfig.password,
        port: dbConfig.port,
        database: "postgres",
    });

    try {
        await admin.connect();
        const exists = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbConfig.database]);
        if (exists.rowCount === 0) {
            console.log(`Database '${dbConfig.database}' not found. Creating...`);
            await admin.query(`CREATE DATABASE ${escapeIdent(dbConfig.database)}`);
            console.log(`Database '${dbConfig.database}' created successfully.`);
        } else {
            console.log(`Database '${dbConfig.database}' already exists.`);
        }
    } finally {
        await admin.end().catch(() => { });
    }
}

async function initDb() {
    await createDatabaseIfNotExists();

    pool = new Pool(dbConfig);

    pool.on("error", (err) => {
        console.error("Unexpected error on idle client", err);
        process.exit(-1);
    });

    const client = await pool.connect();
    try {
        await client.query(`
      CREATE TABLE IF NOT EXISTS evolution_hosts (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255),
        base_url VARCHAR(255) NOT NULL,
        api_key VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

        await client.query(`
      ALTER TABLE evolution_hosts 
      ADD COLUMN IF NOT EXISTS status VARCHAR(50), 
      ADD COLUMN IF NOT EXISTS owner_jid VARCHAR(100), 
      ADD COLUMN IF NOT EXISTS profile_pic_url TEXT,
      ADD COLUMN IF NOT EXISTS webhook_url TEXT;
    `);

        await client.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        remote_jid TEXT NOT NULL,
        instance_name TEXT NOT NULL,
        from_me BOOLEAN DEFAULT FALSE,
        content TEXT,
        media_url TEXT,
        message_type TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

        await client.query(`CREATE INDEX IF NOT EXISTS idx_messages_jid ON messages(remote_jid, instance_name);`);

        await client.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS push_name TEXT;`);

        await client.query(`
      CREATE TABLE IF NOT EXISTS contacts (
        remote_jid TEXT NOT NULL,
        instance_name TEXT NOT NULL,
        push_name TEXT,
        profile_pic_url TEXT,
        number_exists BOOLEAN DEFAULT TRUE,
        is_business BOOLEAN DEFAULT FALSE,
        last_message_content TEXT,
        last_message_from_me BOOLEAN,
        last_message_created_at TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (remote_jid, instance_name)
      );
    `);

        await client.query(`
      CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        prompt TEXT NOT NULL,
        model TEXT DEFAULT 'gpt-3.5-turbo',
        temperature NUMERIC DEFAULT 0.7,
        max_context INTEGER DEFAULT 10,
        is_active BOOLEAN DEFAULT TRUE,
        auto_reply BOOLEAN DEFAULT FALSE,
        working_hours JSONB,
        keywords TEXT[],
        languages TEXT[],
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

        await client.query(`ALTER TABLE agents ADD COLUMN IF NOT EXISTS api_key TEXT;`);

        const contactsCheck = await client.query("SELECT 1 FROM contacts LIMIT 1");
        if (contactsCheck.rowCount === 0) {
            console.log("Backfilling contacts from messages table...");
            await client.query(`
        INSERT INTO contacts (remote_jid, instance_name, push_name, last_message_content, last_message_from_me, last_message_created_at)
        SELECT DISTINCT ON (remote_jid, instance_name)
          remote_jid,
          instance_name,
          push_name,
          content,
          from_me,
          created_at
        FROM messages
        ORDER BY remote_jid, instance_name, created_at DESC
        ON CONFLICT DO NOTHING
      `);
            console.log("Contacts backfilled.");
        }

        console.log("DB ready.");
    } finally {
        client.release();
    }
}

const ready = initDb();

module.exports = {
    ready,
    query: (text, params) => ready.then(() => pool.query(text, params)),
};
