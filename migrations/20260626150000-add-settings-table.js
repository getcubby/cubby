'use strict';

const fs = require('fs');
const path = require('path');

function getConfigFilePath() {
    if (process.env.CLOUDRON) return '/app/data/config.json';

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

    const existing = await db.runSql('SELECT name FROM settings WHERE name=?', [ 'collabora' ]);
    if (existing.rows.length > 0) return;

    await db.runSql('INSERT INTO settings (name, value) VALUES (?, ?)', [ 'collabora', JSON.stringify(collabora) ]);
};

exports.down = async function(db) {
    await db.runSql('DROP TABLE settings');
};
