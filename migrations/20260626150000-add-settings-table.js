'use strict';

const fs = require('fs');
const path = require('path');
const pg = require('pg');

function getConfigFilePath() {
    if (process.env.CONFIG_FILE_PATH) return process.env.CONFIG_FILE_PATH;
    if (process.env.APP_DATA_ROOT) return path.join(process.env.APP_DATA_ROOT, 'config.json');

    return path.join(process.cwd(), 'config.json');
}

exports.up = async function(db) {
    await db.runSql(`CREATE TABLE IF NOT EXISTS settings(
        name VARCHAR(128) NOT NULL PRIMARY KEY,
        value TEXT
    )`);

    const configFilePath = getConfigFilePath();
    if (!fs.existsSync(configFilePath)) return;

    let config;
    try {
        config = JSON.parse(fs.readFileSync(configFilePath, 'utf8'));
    } catch (e) {
        console.log(`Unable to parse config at ${configFilePath}, skipping migration`);
        return;
    }

    const collabora = config.collabora || { host: '' };
    if (!collabora.host) return;

    const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();

    try {
        const existing = await client.query('SELECT name FROM settings WHERE name = $1', [ 'collabora' ]);
        if (existing.rows.length > 0) return;

        await client.query('INSERT INTO settings (name, value) VALUES ($1, $2)', [ 'collabora', JSON.stringify(collabora) ]);
    } finally {
        await client.end();
    }
};

exports.down = async function(db) {
    await db.runSql('DROP TABLE settings');
};
