import assert from 'assert';
import database from './database.js';

const DOCUMENT_VIEWER = 'documentViewer';
const OFFICE_ORIGIN = 'officeOrigin';

async function getDocumentViewer() {
    const result = await database.query('SELECT value FROM settings WHERE key = ?', [ DOCUMENT_VIEWER ]);
    if (result.rows.length === 0) return true;
    return result.rows[0].value !== '0';
}

async function setDocumentViewer(enabled) {
    assert.strictEqual(typeof enabled, 'boolean');

    await database.query('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [ DOCUMENT_VIEWER, enabled ? '1' : '0' ]);
    return enabled;
}

async function getOfficeOrigin() {
    const result = await database.query('SELECT value FROM settings WHERE key = ?', [ OFFICE_ORIGIN ]);
    if (result.rows.length === 0) return '';
    return String(result.rows[0].value || '').replace(/\/$/, '');
}

async function setOfficeOrigin(origin) {
    assert.strictEqual(typeof origin, 'string');

    await database.query('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [ OFFICE_ORIGIN, origin ]);
    return origin;
}

export default {
    getDocumentViewer,
    setDocumentViewer,
    getOfficeOrigin,
    setOfficeOrigin
};
