require('dotenv').config();
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
        await client.query(`
            CREATE TABLE IF NOT EXISTS evolution_hosts (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255),
                base_url VARCHAR(255) NOT NULL,
                api_key VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log("Database table 'evolution_hosts' verified.");
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
