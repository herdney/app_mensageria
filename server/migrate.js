const { Client } = require('pg');
require('dotenv').config();

const client = new Client({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'mensageria',
    password: process.env.DB_PASSWORD || 'postgres',
    port: parseInt(process.env.DB_PORT) || 5432,
});

const runMigration = async () => {
    try {
        await client.connect();
        console.log("Connected to database...");

        await client.query(`
            ALTER TABLE evolution_hosts 
            ADD COLUMN IF NOT EXISTS status VARCHAR(50), 
            ADD COLUMN IF NOT EXISTS owner_jid VARCHAR(100), 
            ADD COLUMN IF NOT EXISTS profile_pic_url TEXT
        `);

        console.log("Schema migration successful: Columns added.");
    } catch (err) {
        console.error("Migration failed:", err);
    } finally {
        await client.end();
    }
};

runMigration();
