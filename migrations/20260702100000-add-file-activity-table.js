'use strict';

exports.up = async function(db) {
    await db.runSql(`CREATE TABLE IF NOT EXISTS file_activity (
        id VARCHAR(128) PRIMARY KEY,
        actor VARCHAR(128) NOT NULL,
        owner VARCHAR(128) NOT NULL,
        file_path VARCHAR(512) NOT NULL,
        action VARCHAR(32) NOT NULL,
        details JSONB,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

        FOREIGN KEY (actor) REFERENCES users(username)
    )`);

    await db.runSql('CREATE INDEX IF NOT EXISTS file_activity_owner_path_idx ON file_activity (owner, file_path, created_at DESC)');
    await db.runSql('CREATE INDEX IF NOT EXISTS file_activity_actor_idx ON file_activity (actor, created_at DESC)');
};

exports.down = async function(db) {
    await db.runSql('DROP TABLE IF EXISTS file_activity');
};
