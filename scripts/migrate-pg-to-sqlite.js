#!/usr/bin/env node

// One-time migration from the legacy postgres database to sqlite.
//
// This runs during the transition release while the postgresql addon is still
// provisioned in the manifest. It is a no-op when:
//   - postgres is not configured (fresh install, or already deprovisioned), or
//   - the data has already been migrated (marker present).
//
// The postgresql addon, the `pg` dependency and this script can be removed in a
// follow-up release once all instances have migrated.

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import pg from 'pg';
import paths from '../backend/paths.js';
import { initSchema } from '../backend/schema.js';

const DONE_MARKER = 'pg_to_sqlite_done';

// Tables in insert order (respecting foreign key dependencies).
const TABLES = [
    'users',
    'groups',
    'groupfolders',
    'tokens',
    'shares',
    'group_members',
    'groupfolders_members',
    'groupfolders_group_members',
    'favorites',
    'recents',
    'file_activity',
    'filedrops'
];

function hasPostgresConfig() {
    return !!(process.env.POSTGRESQL_HOST && process.env.POSTGRESQL_DATABASE);
}

function convertValue(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === 'boolean') return value ? 1 : 0;
    if (value instanceof Date) return value.toISOString();
    if (Buffer.isBuffer(value)) return value;
    if (typeof value === 'object') return JSON.stringify(value);
    return value;
}

async function main() {
    if (!hasPostgresConfig()) {
        console.log('migrate-pg-to-sqlite: no postgres config, skipping');
        process.exit(0);
    }

    fs.mkdirSync(path.dirname(paths.DATABASE_PATH), { recursive: true });

    const db = new Database(paths.DATABASE_PATH);
    db.pragma('foreign_keys = ON');

    db.exec('CREATE TABLE IF NOT EXISTS migration_meta (key TEXT PRIMARY KEY, value TEXT)');
    const done = db.prepare('SELECT value FROM migration_meta WHERE key = ?').get(DONE_MARKER);
    if (done) {
        console.log('migrate-pg-to-sqlite: already migrated, skipping');
        db.close();
        process.exit(0);
    }

    initSchema(db);

    const pool = new pg.Pool({
        host: process.env.POSTGRESQL_HOST,
        port: Number(process.env.POSTGRESQL_PORT || 5432),
        user: process.env.POSTGRESQL_USERNAME,
        password: process.env.POSTGRESQL_PASSWORD,
        database: process.env.POSTGRESQL_DATABASE,
        max: 1
    });

    try {
        // only migrate tables that actually exist in the source database
        const tableResult = await pool.query(`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`);
        const existing = new Set(tableResult.rows.map((r) => r.tablename));
        const tables = TABLES.filter((t) => existing.has(t));

        const data = [];
        for (const table of tables) {
            const result = await pool.query(`SELECT * FROM ${table}`);
            const columns = result.fields.map((f) => f.name);
            data.push({ table, columns, rows: result.rows });
        }

        const migrate = db.transaction(() => {
            // clear targets in reverse dependency order
            for (const { table } of [ ...data ].reverse()) {
                db.prepare(`DELETE FROM ${table}`).run();
            }

            for (const { table, columns, rows } of data) {
                if (rows.length === 0) continue;
                const columnList = columns.map((c) => `"${c}"`).join(', ');
                const placeholders = columns.map(() => '?').join(', ');
                const insert = db.prepare(`INSERT INTO ${table} (${columnList}) VALUES (${placeholders})`);
                for (const row of rows) {
                    insert.run(...columns.map((c) => convertValue(row[c])));
                }
            }
        });

        migrate();

        db.prepare('INSERT INTO migration_meta (key, value) VALUES (?, ?)').run(DONE_MARKER, new Date().toISOString());

        const counts = data.map(({ table, rows }) => `${table}=${rows.length}`).join(', ');
        console.log(`migrate-pg-to-sqlite: migrated ${counts}`);
    } catch (error) {
        console.error('migrate-pg-to-sqlite: migration failed', error);
        process.exit(1);
    } finally {
        await pool.end().catch(() => {});
        db.close();
    }
}

main().catch((error) => {
    console.error('migrate-pg-to-sqlite: unexpected error', error);
    process.exit(1);
});
