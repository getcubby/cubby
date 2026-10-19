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
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    email TEXT NOT NULL,
    display_name TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT ${TIMESTAMP_DEFAULT},
    active INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS users_username_idx ON users(username);

CREATE TABLE IF NOT EXISTS tokens(
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT ${TIMESTAMP_DEFAULT},

    FOREIGN KEY(user_id) REFERENCES users(id) ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS groups(
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS group_members(
    group_id TEXT REFERENCES groups(id) ON DELETE CASCADE,
    user_id TEXT REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,

    UNIQUE (group_id, user_id)
);

CREATE TABLE IF NOT EXISTS groupfolders(
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS groupfolders_members(
    groupfolder_id TEXT REFERENCES groupfolders(id) ON DELETE CASCADE,
    user_id TEXT REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    role TEXT NOT NULL DEFAULT 'editor',

    UNIQUE (groupfolder_id, user_id)
);

CREATE TABLE IF NOT EXISTS groupfolders_group_members(
    groupfolder_id TEXT REFERENCES groupfolders(id) ON DELETE CASCADE,
    group_id TEXT REFERENCES groups(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'editor',

    UNIQUE (groupfolder_id, group_id)
);

CREATE TABLE IF NOT EXISTS shares(
    id TEXT PRIMARY KEY,
    owner_user_id TEXT REFERENCES users(id) ON UPDATE CASCADE,
    owner_groupfolder TEXT REFERENCES groupfolders(id),
    file_path TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT ${TIMESTAMP_DEFAULT},
    expires_at TEXT,
    readonly INTEGER NOT NULL DEFAULT 0,
    receiver_user_id TEXT REFERENCES users(id) ON UPDATE CASCADE,
    receiver_email TEXT,
    receiver_group TEXT REFERENCES groups(id) ON DELETE CASCADE,
    password_hash TEXT,
    name TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS favorites(
    id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    share_id TEXT REFERENCES shares(id) ON DELETE CASCADE,
    owner_user_id TEXT REFERENCES users(id) ON UPDATE CASCADE,
    owner_groupfolder TEXT REFERENCES groupfolders(id),
    file_path TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT ${TIMESTAMP_DEFAULT}
);

CREATE UNIQUE INDEX IF NOT EXISTS favorites_user_share_path ON favorites (user_id, share_id, file_path) WHERE share_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS favorites_user_owner_path ON favorites (user_id, owner_user_id, owner_groupfolder, file_path) WHERE share_id IS NULL;

CREATE TABLE IF NOT EXISTS recents(
    opener TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    share_id TEXT REFERENCES shares(id) ON DELETE CASCADE,
    owner_user_id TEXT REFERENCES users(id) ON UPDATE CASCADE,
    owner_groupfolder TEXT REFERENCES groupfolders(id),
    file_path TEXT NOT NULL,
    accessed_at TEXT NOT NULL DEFAULT ${TIMESTAMP_DEFAULT}
);

CREATE UNIQUE INDEX IF NOT EXISTS recents_opener_share_path ON recents (opener, share_id, file_path) WHERE share_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS recents_opener_owner_path ON recents (opener, owner_user_id, owner_groupfolder, file_path) WHERE share_id IS NULL;

CREATE TABLE IF NOT EXISTS file_activity(
    id TEXT PRIMARY KEY,
    actor TEXT REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    owner_user_id TEXT REFERENCES users(id) ON UPDATE CASCADE,
    owner_groupfolder TEXT REFERENCES groupfolders(id),
    file_path TEXT NOT NULL,
    action TEXT NOT NULL,
    details TEXT,
    created_at TEXT NOT NULL DEFAULT ${TIMESTAMP_DEFAULT}
);

CREATE INDEX IF NOT EXISTS file_activity_owner_path_idx ON file_activity (owner_user_id, owner_groupfolder, file_path, created_at DESC);
CREATE INDEX IF NOT EXISTS file_activity_actor_idx ON file_activity (actor, created_at DESC);

CREATE TABLE IF NOT EXISTS filedrops(
    id TEXT PRIMARY KEY,
    owner_user_id TEXT REFERENCES users(id) ON UPDATE CASCADE,
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
export const SCHEMA_VERSION = 6;

const MIGRATIONS = [
    {
        // file_activity.actor becomes nullable so anonymous (public link) edits can
        // be recorded with a NULL actor. SQLite cannot drop a NOT NULL constraint in
        // place, so the table is rebuilt.
        version: 2,
        up(db) {
            db.exec(`
                BEGIN;
                CREATE TABLE file_activity_new(
                    id TEXT PRIMARY KEY,
                    actor TEXT REFERENCES users(username) ON DELETE CASCADE,
                    owner_username TEXT REFERENCES users(username),
                    owner_groupfolder TEXT REFERENCES groupfolders(id),
                    file_path TEXT NOT NULL,
                    action TEXT NOT NULL,
                    details TEXT,
                    created_at TEXT NOT NULL DEFAULT ${TIMESTAMP_DEFAULT}
                );
                INSERT INTO file_activity_new (id, actor, owner_username, owner_groupfolder, file_path, action, details, created_at)
                    SELECT id, actor, owner_username, owner_groupfolder, file_path, action, details, created_at FROM file_activity;
                DROP TABLE file_activity;
                ALTER TABLE file_activity_new RENAME TO file_activity;
                CREATE INDEX IF NOT EXISTS file_activity_owner_path_idx ON file_activity (owner_username, owner_groupfolder, file_path, created_at DESC);
                CREATE INDEX IF NOT EXISTS file_activity_actor_idx ON file_activity (actor, created_at DESC);
                COMMIT;
            `);
        }
    },
    {
        // Android login is PKCE against the public OIDC client. The app sends
        // that access token directly, so the opaque mobile token rows are unused.
        version: 3,
        up(db) {
            db.exec('DROP TABLE IF EXISTS mobile_tokens');
        }
    },
    {
        // Directory presence is an active flag. source only existed so SCIM sync
        // could delete groups it had created; every account comes from SCIM or OIDC.
        version: 4,
        up(db) {
            db.exec(`
                ALTER TABLE users ADD COLUMN active INTEGER NOT NULL DEFAULT 1;
                ALTER TABLE groups ADD COLUMN active INTEGER NOT NULL DEFAULT 1;
                ALTER TABLE users DROP COLUMN source;
                ALTER TABLE groups DROP COLUMN source;
            `);
        }
    },
    {
        // Users are keyed by id. Existing rows keep the username as that id until
        // startup sync replaces it with the SCIM uid. Home directories stay put.
        version: 5,
        up(db) {
            const rows = db.prepare('SELECT username FROM users').all();
            const idFor = new Map(rows.map((row) => [ row.username, row.username ]));

            db.pragma('foreign_keys = OFF');
            db.exec('BEGIN');
            db.exec(`
                CREATE TABLE user_id_map (username TEXT PRIMARY KEY, id TEXT NOT NULL);
                CREATE TABLE users_new(
                    id TEXT PRIMARY KEY,
                    username TEXT NOT NULL,
                    email TEXT NOT NULL,
                    display_name TEXT DEFAULT '',
                    created_at TEXT NOT NULL,
                    active INTEGER NOT NULL DEFAULT 1
                );
            `);

            const insertMap = db.prepare('INSERT INTO user_id_map (username, id) VALUES (?, ?)');
            for (const [ username, id ] of idFor) insertMap.run(username, id);

            db.exec(`
                INSERT INTO users_new (id, username, email, display_name, created_at, active)
                    SELECT m.id, u.username, u.email, u.display_name, u.created_at, u.active
                    FROM users u JOIN user_id_map m ON m.username = u.username;
                DROP TABLE users;
                ALTER TABLE users_new RENAME TO users;
                CREATE INDEX IF NOT EXISTS users_username_idx ON users(username);

                CREATE TABLE tokens_new(
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY(user_id) REFERENCES users(id) ON UPDATE CASCADE
                );
                CREATE TABLE group_members_new(
                    group_id TEXT REFERENCES groups(id) ON DELETE CASCADE,
                    user_id TEXT REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
                    UNIQUE (group_id, user_id)
                );
                CREATE TABLE groupfolders_members_new(
                    groupfolder_id TEXT REFERENCES groupfolders(id) ON DELETE CASCADE,
                    user_id TEXT REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
                    role TEXT NOT NULL DEFAULT 'editor',
                    UNIQUE (groupfolder_id, user_id)
                );
                CREATE TABLE shares_new(
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
                    password_hash TEXT
                );
                CREATE TABLE favorites_new(
                    id TEXT PRIMARY KEY,
                    user_id TEXT REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
                    share_id TEXT REFERENCES shares(id) ON DELETE CASCADE,
                    owner_user_id TEXT REFERENCES users(id) ON UPDATE CASCADE,
                    owner_groupfolder TEXT REFERENCES groupfolders(id),
                    file_path TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );
                CREATE TABLE recents_new(
                    opener TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
                    share_id TEXT REFERENCES shares(id) ON DELETE CASCADE,
                    owner_user_id TEXT REFERENCES users(id) ON UPDATE CASCADE,
                    owner_groupfolder TEXT REFERENCES groupfolders(id),
                    file_path TEXT NOT NULL,
                    accessed_at TEXT NOT NULL
                );
                CREATE TABLE file_activity_new(
                    id TEXT PRIMARY KEY,
                    actor TEXT REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
                    owner_user_id TEXT REFERENCES users(id) ON UPDATE CASCADE,
                    owner_groupfolder TEXT REFERENCES groupfolders(id),
                    file_path TEXT NOT NULL,
                    action TEXT NOT NULL,
                    details TEXT,
                    created_at TEXT NOT NULL
                );
                CREATE TABLE filedrops_new(
                    id TEXT PRIMARY KEY,
                    owner_user_id TEXT REFERENCES users(id) ON UPDATE CASCADE,
                    owner_groupfolder TEXT REFERENCES groupfolders(id),
                    file_path TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    expires_at TEXT,
                    password_hash TEXT
                );
            `);

            db.exec(`
                INSERT INTO tokens_new (id, user_id, created_at)
                    SELECT t.id, m.id, t.created_at FROM tokens t JOIN user_id_map m ON m.username = t.username;
                DROP TABLE tokens;
                ALTER TABLE tokens_new RENAME TO tokens;

                INSERT INTO group_members_new (group_id, user_id)
                    SELECT g.group_id, m.id FROM group_members g JOIN user_id_map m ON m.username = g.username;
                DROP TABLE group_members;
                ALTER TABLE group_members_new RENAME TO group_members;

                INSERT INTO groupfolders_members_new (groupfolder_id, user_id, role)
                    SELECT g.groupfolder_id, m.id, g.role FROM groupfolders_members g JOIN user_id_map m ON m.username = g.username;
                DROP TABLE groupfolders_members;
                ALTER TABLE groupfolders_members_new RENAME TO groupfolders_members;

                INSERT INTO shares_new (id, owner_user_id, owner_groupfolder, file_path, created_at, expires_at, readonly, receiver_user_id, receiver_email, receiver_group, password_hash)
                    SELECT s.id, owner_map.id, s.owner_groupfolder, s.file_path, s.created_at, s.expires_at, s.readonly, receiver_map.id, s.receiver_email, s.receiver_group, s.password_hash
                    FROM shares s
                    LEFT JOIN user_id_map owner_map ON owner_map.username = s.owner_username
                    LEFT JOIN user_id_map receiver_map ON receiver_map.username = s.receiver_username;
                DROP TABLE shares;
                ALTER TABLE shares_new RENAME TO shares;

                INSERT INTO favorites_new (id, user_id, share_id, owner_user_id, owner_groupfolder, file_path, created_at)
                    SELECT f.id, user_map.id, f.share_id, owner_map.id, f.owner_groupfolder, f.file_path, f.created_at
                    FROM favorites f
                    LEFT JOIN user_id_map user_map ON user_map.username = f.username
                    LEFT JOIN user_id_map owner_map ON owner_map.username = f.owner_username;
                DROP TABLE favorites;
                ALTER TABLE favorites_new RENAME TO favorites;
                CREATE UNIQUE INDEX IF NOT EXISTS favorites_user_share_path ON favorites (user_id, share_id, file_path) WHERE share_id IS NOT NULL;
                CREATE UNIQUE INDEX IF NOT EXISTS favorites_user_owner_path ON favorites (user_id, owner_user_id, owner_groupfolder, file_path) WHERE share_id IS NULL;

                INSERT INTO recents_new (opener, share_id, owner_user_id, owner_groupfolder, file_path, accessed_at)
                    SELECT opener_map.id, r.share_id, owner_map.id, r.owner_groupfolder, r.file_path, r.accessed_at
                    FROM recents r
                    JOIN user_id_map opener_map ON opener_map.username = r.opener
                    LEFT JOIN user_id_map owner_map ON owner_map.username = r.owner_username;
                DROP TABLE recents;
                ALTER TABLE recents_new RENAME TO recents;
                CREATE UNIQUE INDEX IF NOT EXISTS recents_opener_share_path ON recents (opener, share_id, file_path) WHERE share_id IS NOT NULL;
                CREATE UNIQUE INDEX IF NOT EXISTS recents_opener_owner_path ON recents (opener, owner_user_id, owner_groupfolder, file_path) WHERE share_id IS NULL;

                INSERT INTO file_activity_new (id, actor, owner_user_id, owner_groupfolder, file_path, action, details, created_at)
                    SELECT a.id, actor_map.id, owner_map.id, a.owner_groupfolder, a.file_path, a.action, a.details, a.created_at
                    FROM file_activity a
                    LEFT JOIN user_id_map actor_map ON actor_map.username = a.actor
                    LEFT JOIN user_id_map owner_map ON owner_map.username = a.owner_username;
                DROP TABLE file_activity;
                ALTER TABLE file_activity_new RENAME TO file_activity;
                CREATE INDEX IF NOT EXISTS file_activity_owner_path_idx ON file_activity (owner_user_id, owner_groupfolder, file_path, created_at DESC);
                CREATE INDEX IF NOT EXISTS file_activity_actor_idx ON file_activity (actor, created_at DESC);

                INSERT INTO filedrops_new (id, owner_user_id, owner_groupfolder, file_path, created_at, expires_at, password_hash)
                    SELECT d.id, owner_map.id, d.owner_groupfolder, d.file_path, d.created_at, d.expires_at, d.password_hash
                    FROM filedrops d
                    LEFT JOIN user_id_map owner_map ON owner_map.username = d.owner_username;
                DROP TABLE filedrops;
                ALTER TABLE filedrops_new RENAME TO filedrops;

                DROP TABLE user_id_map;
            `);
            db.exec('COMMIT');
            db.pragma('foreign_keys = ON');
        }
    },
    {
        // Public links and email shares have a name. Existing ones take their created time.
        version: 6,
        up(db) {
            db.exec(`
                ALTER TABLE shares ADD COLUMN name TEXT NOT NULL DEFAULT '';
                UPDATE shares SET name = created_at
                    WHERE receiver_user_id IS NULL AND receiver_group IS NULL;
            `);
        }
    }
];

export function initSchema(db) {
    const current = Number(db.pragma('user_version', { simple: true }) || 0);

    // FULL_SCHEMA indexes the current columns. An older database still has the
    // previous tables, so those indexes are created after the migrations.
    if (current === 0 || current >= SCHEMA_VERSION) db.exec(FULL_SCHEMA);

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

    if (current < SCHEMA_VERSION) db.exec(FULL_SCHEMA);
}
