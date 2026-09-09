// Single source of truth for the Cubby SQLite schema.
//
// Times are stored as ISO-8601 UTC strings ("YYYY-MM-DDTHH:MM:SS.sssZ") so that
// lexicographic ordering matches chronological ordering and `new Date()` parses
// them unambiguously.
//
// Booleans are stored as INTEGER (0/1) since SQLite has no native boolean type.
// The database.js wrapper converts JS booleans to 0/1 on write; callers convert
// back to booleans on read where needed (e.g. shares.readonly).
//
// JSON values (file_activity.details) are stored as TEXT, already serialized by
// the callers.

const TIMESTAMP_DEFAULT = "(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))";

const FULL_SCHEMA = `
CREATE TABLE IF NOT EXISTS users(
    username TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    display_name TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT ${TIMESTAMP_DEFAULT},
    source TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS tokens(
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT ${TIMESTAMP_DEFAULT},

    FOREIGN KEY(username) REFERENCES users(username)
);

CREATE TABLE IF NOT EXISTS groups(
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS group_members(
    group_id TEXT REFERENCES groups(id) ON DELETE CASCADE,
    username TEXT REFERENCES users(username) ON DELETE CASCADE,

    UNIQUE (group_id, username)
);

CREATE TABLE IF NOT EXISTS groupfolders(
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS groupfolders_members(
    groupfolder_id TEXT REFERENCES groupfolders(id) ON DELETE CASCADE,
    username TEXT REFERENCES users(username) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'editor',

    UNIQUE (groupfolder_id, username)
);

CREATE TABLE IF NOT EXISTS groupfolders_group_members(
    groupfolder_id TEXT REFERENCES groupfolders(id) ON DELETE CASCADE,
    group_id TEXT REFERENCES groups(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'editor',

    UNIQUE (groupfolder_id, group_id)
);

CREATE TABLE IF NOT EXISTS shares(
    id TEXT PRIMARY KEY,
    owner_username TEXT REFERENCES users(username),
    owner_groupfolder TEXT REFERENCES groupfolders(id),
    file_path TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT ${TIMESTAMP_DEFAULT},
    expires_at TEXT,
    readonly INTEGER NOT NULL DEFAULT 0,
    receiver_username TEXT REFERENCES users(username),
    receiver_email TEXT,
    receiver_group TEXT REFERENCES groups(id) ON DELETE CASCADE,
    password_hash TEXT
);

CREATE TABLE IF NOT EXISTS favorites(
    id TEXT PRIMARY KEY,
    username TEXT REFERENCES users(username) ON DELETE CASCADE,
    share_id TEXT REFERENCES shares(id) ON DELETE CASCADE,
    owner_username TEXT REFERENCES users(username),
    owner_groupfolder TEXT REFERENCES groupfolders(id),
    file_path TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT ${TIMESTAMP_DEFAULT}
);

CREATE UNIQUE INDEX IF NOT EXISTS favorites_user_share_path ON favorites (username, share_id, file_path) WHERE share_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS favorites_user_owner_path ON favorites (username, owner_username, owner_groupfolder, file_path) WHERE share_id IS NULL;

CREATE TABLE IF NOT EXISTS recents(
    opener TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
    share_id TEXT REFERENCES shares(id) ON DELETE CASCADE,
    owner_username TEXT REFERENCES users(username),
    owner_groupfolder TEXT REFERENCES groupfolders(id),
    file_path TEXT NOT NULL,
    accessed_at TEXT NOT NULL DEFAULT ${TIMESTAMP_DEFAULT}
);

CREATE UNIQUE INDEX IF NOT EXISTS recents_opener_share_path ON recents (opener, share_id, file_path) WHERE share_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS recents_opener_owner_path ON recents (opener, owner_username, owner_groupfolder, file_path) WHERE share_id IS NULL;

CREATE TABLE IF NOT EXISTS file_activity(
    id TEXT PRIMARY KEY,
    actor TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
    owner_username TEXT REFERENCES users(username),
    owner_groupfolder TEXT REFERENCES groupfolders(id),
    file_path TEXT NOT NULL,
    action TEXT NOT NULL,
    details TEXT,
    created_at TEXT NOT NULL DEFAULT ${TIMESTAMP_DEFAULT}
);

CREATE INDEX IF NOT EXISTS file_activity_owner_path_idx ON file_activity (owner_username, owner_groupfolder, file_path, created_at DESC);
CREATE INDEX IF NOT EXISTS file_activity_actor_idx ON file_activity (actor, created_at DESC);

CREATE TABLE IF NOT EXISTS filedrops(
    id TEXT PRIMARY KEY,
    owner_username TEXT REFERENCES users(username),
    owner_groupfolder TEXT REFERENCES groupfolders(id),
    file_path TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT ${TIMESTAMP_DEFAULT},
    expires_at TEXT,
    password_hash TEXT
);
`;

// Bump this whenever the schema changes and append a migration to MIGRATIONS
// below for existing databases. FULL_SCHEMA must always reflect the latest
// version so fresh installs are created directly at SCHEMA_VERSION.
export const SCHEMA_VERSION = 1;

const MIGRATIONS = [
    // Example for future changes:
    // {
    //     version: 2,
    //     up(db) {
    //         db.exec('ALTER TABLE users ADD COLUMN foo TEXT DEFAULT \'\';');
    //     }
    // }
];

export function initSchema(db) {
    db.exec(FULL_SCHEMA);

    const current = Number(db.pragma('user_version', { simple: true }) || 0);
    if (current === 0) {
        // Fresh install: FULL_SCHEMA already reflects SCHEMA_VERSION.
        db.pragma(`user_version = ${SCHEMA_VERSION}`);
        return;
    }

    for (const migration of MIGRATIONS) {
        if (migration.version <= current) continue;
        migration.up(db);
        db.pragma(`user_version = ${migration.version}`);
    }
}
