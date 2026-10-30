import { describe, it } from 'mocha';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { initSchema, SCHEMA_VERSION } from '../schema.js';

const TABLES = [ 'users', 'tokens', 'shares', 'favorites', 'recents', 'file_activity', 'filedrops' ];

// Shape left by migration 5, plus the name column added in migration 6.
// Timestamp columns have no default.
const UPGRADED_SCHEMA = `
CREATE TABLE users(
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    email TEXT NOT NULL,
    display_name TEXT DEFAULT '',
    created_at TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX users_username_idx ON users(username);

CREATE TABLE tokens(
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id) ON UPDATE CASCADE
);

CREATE TABLE groups(
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE groupfolders(
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL
);

CREATE TABLE shares(
    id TEXT PRIMARY KEY,
    owner_user_id TEXT REFERENCES users(id) ON UPDATE CASCADE,
    owner_groupfolder TEXT REFERENCES groupfolders(id),
    file_path TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT,
    readonly INTEGER NOT NULL DEFAULT 0,
    receiver_user_id TEXT REFERENCES users(id) ON UPDATE CASCADE,
    receiver_email TEXT,
    receiver_group TEXT REFERENCES groups(id) ON DELETE CASCADE,
    password_hash TEXT,
    name TEXT NOT NULL DEFAULT ''
);

CREATE TABLE favorites(
    id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    share_id TEXT REFERENCES shares(id) ON DELETE CASCADE,
    owner_user_id TEXT REFERENCES users(id) ON UPDATE CASCADE,
    owner_groupfolder TEXT REFERENCES groupfolders(id),
    file_path TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX favorites_user_share_path ON favorites (user_id, share_id, file_path) WHERE share_id IS NOT NULL;
CREATE UNIQUE INDEX favorites_user_owner_path ON favorites (user_id, owner_user_id, owner_groupfolder, file_path) WHERE share_id IS NULL;

CREATE TABLE recents(
    opener TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    share_id TEXT REFERENCES shares(id) ON DELETE CASCADE,
    owner_user_id TEXT REFERENCES users(id) ON UPDATE CASCADE,
    owner_groupfolder TEXT REFERENCES groupfolders(id),
    file_path TEXT NOT NULL,
    accessed_at TEXT NOT NULL
);
CREATE UNIQUE INDEX recents_opener_share_path ON recents (opener, share_id, file_path) WHERE share_id IS NOT NULL;
CREATE UNIQUE INDEX recents_opener_owner_path ON recents (opener, owner_user_id, owner_groupfolder, file_path) WHERE share_id IS NULL;

CREATE TABLE file_activity(
    id TEXT PRIMARY KEY,
    actor TEXT REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    owner_user_id TEXT REFERENCES users(id) ON UPDATE CASCADE,
    owner_groupfolder TEXT REFERENCES groupfolders(id),
    file_path TEXT NOT NULL,
    action TEXT NOT NULL,
    details TEXT,
    created_at TEXT NOT NULL
);
CREATE INDEX file_activity_owner_path_idx ON file_activity (owner_user_id, owner_groupfolder, file_path, created_at DESC);
CREATE INDEX file_activity_actor_idx ON file_activity (actor, created_at DESC);

CREATE TABLE filedrops(
    id TEXT PRIMARY KEY,
    owner_user_id TEXT REFERENCES users(id) ON UPDATE CASCADE,
    owner_groupfolder TEXT REFERENCES groupfolders(id),
    file_path TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT,
    password_hash TEXT
);
`;

function columns(db, table) {
    return db.pragma(`table_info(${table})`).map(function (column) {
        return {
            name: column.name,
            type: column.type,
            notnull: column.notnull,
            dflt_value: column.dflt_value,
            pk: column.pk
        };
    });
}

function indexes(db, table) {
    return db.pragma(`index_list(${table})`).map(function (index) {
        return {
            name: index.name,
            unique: index.unique,
            partial: index.partial,
            columns: db.pragma(`index_xinfo(${index.name})`).filter(function (column) { return column.key; }).map(function (column) {
                return { name: column.name, desc: column.desc };
            })
        };
    }).sort(function (a, b) { return a.name.localeCompare(b.name); });
}

function foreignKeys(db, table) {
    return db.pragma(`foreign_key_list(${table})`).map(function (fk) {
        return {
            table: fk.table,
            from: fk.from,
            to: fk.to,
            on_update: fk.on_update,
            on_delete: fk.on_delete
        };
    }).sort(function (a, b) { return `${a.from}`.localeCompare(`${b.from}`); });
}

describe('schema', function () {
    it('gives an upgraded database the same timestamp defaults as a fresh install', function () {
        const fresh = new Database(':memory:');
        const upgraded = new Database(':memory:');

        try {
            initSchema(fresh);

            upgraded.exec(UPGRADED_SCHEMA);
            upgraded.prepare(`INSERT INTO users (id, username, email, created_at) VALUES ('uid-alice', 'alice', 'alice@test.local', '2020-01-02T03:04:05.000Z')`).run();
            upgraded.prepare(`INSERT INTO shares (id, owner_user_id, file_path, created_at, name) VALUES ('sid-old', 'uid-alice', '/a.txt', '2020-01-02T03:04:05.000Z', 'notes')`).run();
            upgraded.pragma('user_version = 6');
            initSchema(upgraded);

            assert.equal(fresh.pragma('user_version', { simple: true }), SCHEMA_VERSION);
            assert.equal(upgraded.pragma('user_version', { simple: true }), SCHEMA_VERSION);

            for (const table of TABLES) {
                assert.deepEqual(columns(upgraded, table), columns(fresh, table), table);
                assert.deepEqual(indexes(upgraded, table), indexes(fresh, table), table);
                assert.deepEqual(foreignKeys(upgraded, table), foreignKeys(fresh, table), table);
            }

            assert.equal(upgraded.prepare(`SELECT created_at FROM users WHERE id = 'uid-alice'`).get().created_at, '2020-01-02T03:04:05.000Z');
            const oldShare = upgraded.prepare(`SELECT created_at, name FROM shares WHERE id = 'sid-old'`).get();
            assert.equal(oldShare.created_at, '2020-01-02T03:04:05.000Z');
            assert.equal(oldShare.name, 'notes');

            upgraded.prepare(`INSERT INTO users (id, username, email) VALUES ('uid-new', 'new', 'new@test.local')`).run();
            upgraded.prepare(`INSERT INTO tokens (id, user_id) VALUES ('tok-new', 'uid-new')`).run();
            upgraded.prepare(`INSERT INTO shares (id, file_path) VALUES ('sid-new', '/b.txt')`).run();
            upgraded.prepare(`INSERT INTO favorites (id, user_id, file_path) VALUES ('fav-new', 'uid-new', '/b.txt')`).run();
            upgraded.prepare(`INSERT INTO recents (opener, file_path) VALUES ('uid-new', '/b.txt')`).run();
            upgraded.prepare(`INSERT INTO file_activity (id, file_path, action) VALUES ('act-new', '/b.txt', 'created')`).run();
            upgraded.prepare(`INSERT INTO filedrops (id, file_path) VALUES ('fdp-new', '/b.txt')`).run();

            const timestamps = [
                upgraded.prepare(`SELECT created_at AS ts FROM users WHERE id = 'uid-new'`).get(),
                upgraded.prepare(`SELECT created_at AS ts FROM tokens WHERE id = 'tok-new'`).get(),
                upgraded.prepare(`SELECT created_at AS ts FROM shares WHERE id = 'sid-new'`).get(),
                upgraded.prepare(`SELECT created_at AS ts FROM favorites WHERE id = 'fav-new'`).get(),
                upgraded.prepare(`SELECT accessed_at AS ts FROM recents WHERE opener = 'uid-new'`).get(),
                upgraded.prepare(`SELECT created_at AS ts FROM file_activity WHERE id = 'act-new'`).get(),
                upgraded.prepare(`SELECT created_at AS ts FROM filedrops WHERE id = 'fdp-new'`).get()
            ];
            for (const row of timestamps) assert.match(row.ts, /^\d{4}-\d{2}-\d{2}T/);

            const created = upgraded.prepare(`SELECT name, readonly FROM shares WHERE id = 'sid-new'`).get();
            assert.equal(created.name, '');
            assert.equal(created.readonly, 0);
        } finally {
            fresh.close();
            upgraded.close();
        }
    });
});
