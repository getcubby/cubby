import assert from 'assert';
import MainError from './mainerror.js';
import Database from 'better-sqlite3';
import debug from 'debug';
import fs from 'fs';
import path from 'path';
import paths from './paths.js';
import { initSchema } from './schema.js';

const debugLog = debug('cubby:database');

let gDb = null;

function serializeArg(value) {
    if (value === undefined) return null;
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'boolean') return value ? 1 : 0;
    return value;
}

function serializeArgs(args) {
    assert(typeof args === 'undefined' || Array.isArray(args));
    if (!args) return [];
    return args.map(serializeArg);
}

// SQLite stores booleans as 0/1 and better-sqlite3 rejects Date/boolean values,
// so they are normalized on the way in. See serializeArg.
function execute(db, sql, args) {
    assert.strictEqual(typeof sql, 'string');

    const values = serializeArgs(args);
    const statement = db.prepare(sql);
    const trimmed = sql.trimStart().toLowerCase();

    if (trimmed.startsWith('select') || trimmed.startsWith('with') || trimmed.startsWith('pragma')) {
        const rows = statement.all(...values);
        return { rows, rowCount: rows.length };
    }

    const result = statement.run(...values);
    return { rows: [], rowCount: result.changes };
}

function init() {
    if (gDb !== null) return;

    debugLog(`init: opening sqlite database at ${paths.DATABASE_PATH}`);

    fs.mkdirSync(path.dirname(paths.DATABASE_PATH), { recursive: true });

    gDb = new Database(paths.DATABASE_PATH);
    gDb.pragma('foreign_keys = ON');
    gDb.pragma('busy_timeout = 5000');

    // enables the REGEXP operator (used by shares.js for path prefix matching)
    gDb.function('regexp', { deterministic: true }, (pattern, value) => {
        if (value == null) return 0;
        return new RegExp(pattern).test(String(value)) ? 1 : 0;
    });

    initSchema(gDb);
}

async function query(sql, args) {
    assert.strictEqual(typeof sql, 'string');
    assert(typeof args === 'undefined' || Array.isArray(args));

    if (gDb === null) throw new MainError(MainError.DATABASE_ERROR, 'database.js not initialized');

    try {
        return execute(gDb, sql, args);
    } catch (error) {
        throw new MainError(MainError.DATABASE_ERROR, error);
    }
}

async function transaction(queries) {
    assert(Array.isArray(queries));

    if (gDb === null) throw new MainError(MainError.DATABASE_ERROR, 'database.js not initialized');

    try {
        const runAll = gDb.transaction((queryList) => {
            for (const q of queryList) {
                execute(gDb, q.query, q.args);
            }
        });
        runAll(queries);
    } catch (error) {
        throw new MainError(MainError.DATABASE_ERROR, error);
    }
}

async function uninitialize() {
    if (gDb === null) return;

    gDb.close();
    gDb = null;
    debugLog('database closed');
}

async function clear() {
    const result = await query(`SELECT name FROM sqlite_master WHERE type = 'table' AND name <> 'sqlite_sequence'`);
    if (result.rows.length === 0) return;

    // disable FK checks while truncating so the (unordered) table list can be
    // cleared in one pass
    gDb.pragma('foreign_keys = OFF');
    try {
        for (const row of result.rows) {
            await query(`DELETE FROM "${row.name}"`);
        }
    } finally {
        gDb.pragma('foreign_keys = ON');
    }
}

export default {
    init,
    uninitialize,
    query,
    transaction,
    _clear: clear
};
