const express = require('express');
const cors = require('cors');
const db = require('./db');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

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
    const { name, base_url, api_key } = req.body;
    if (!base_url || !api_key) {
        return res.status(400).json({ error: 'Base URL and API Key are required' });
    }
    try {
        const { rows } = await db.query(
            'INSERT INTO evolution_hosts (name, base_url, api_key, status, owner_jid, profile_pic_url) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
            [name || 'Untitled', base_url, api_key, req.body.status, req.body.owner_jid, req.body.profile_pic_url]
        );
        res.status(201).json(rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to save host' });
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

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
