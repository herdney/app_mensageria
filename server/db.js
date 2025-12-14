const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { Pool, Client } = require('pg');

const dbConfig = {
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'mensageria',
    password: process.env.DB_PASSWORD || 'postgres',
    port: process.env.DB_PORT || 5432,
};

let pool;

const createDatabaseIfNotExists = async () => {
    const client = new Client({
        user: dbConfig.user,
        host: dbConfig.host,
        password: dbConfig.password,
        port: dbConfig.port,
        database: 'postgres', // Connect to default postgres DB
    });

    try {
        await client.connect();
        const res = await client.query(`SELECT 1 FROM pg_database WHERE datname = '${dbConfig.database}'`);
        if (res.rowCount === 0) {
            console.log(`Database '${dbConfig.database}' not found. Creating...`);
            await client.query(`CREATE DATABASE "${dbConfig.database}"`);
            console.log(`Database '${dbConfig.database}' created successfully.`);
        } else {
            console.log(`Database '${dbConfig.database}' already exists.`);
        }
    } catch (err) {
        console.error("Error creating database:", err);
    } finally {
        await client.end();
    }
};

const initDb = async () => {
    await createDatabaseIfNotExists();

    pool = new Pool(dbConfig);

    pool.on('error', (err) => {
        console.error('Unexpected error on idle client', err);
        process.exit(-1);
    });

    try {
        const client = await pool.connect();

        // 1. Evolution Hosts Table
        await client.query(`
            CREATE TABLE IF NOT EXISTS evolution_hosts (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255),
                base_url VARCHAR(255) NOT NULL,
                api_key VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Add columns to evolution_hosts if they don't exist
        await client.query(`
            ALTER TABLE evolution_hosts 
            ADD COLUMN IF NOT EXISTS status VARCHAR(50), 
            ADD COLUMN IF NOT EXISTS owner_jid VARCHAR(100), 
            ADD COLUMN IF NOT EXISTS profile_pic_url TEXT,
            ADD COLUMN IF NOT EXISTS webhook_url TEXT
        `);

        // 2. Messages Table
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

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_messages_jid ON messages(remote_jid, instance_name);
        `);

        // Add push_name to messages if it doesn't exist
        await client.query(`
            ALTER TABLE messages 
            ADD COLUMN IF NOT EXISTS push_name TEXT
        `);

        // 3. Contacts Table
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

        // Backfill contacts from messages if empty
        const contactsCheck = await client.query('SELECT 1 FROM contacts LIMIT 1');
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

        console.log("Database tables 'evolution_hosts', 'messages', and 'contacts' verified.");
        client.release();
    } catch (err) {
        console.error("Error initializing tables:", err);
    }
};

initDb();

module.exports = {
    query: (text, params) => {
        if (!pool) return Promise.reject(new Error("Database not initialized yet"));
        return pool.query(text, params);
    },
};
