'use strict';

exports.up = async function(db) {
    const result = await db.runSql(`SELECT column_name FROM information_schema.columns WHERE table_name = 'file_activity' AND column_name = 'owner'`);
    if (result.rows.length === 0) return;

    await db.runSql('DROP INDEX IF EXISTS file_activity_owner_path_idx');
    await db.runSql('ALTER TABLE file_activity DROP COLUMN owner');
    await db.runSql('ALTER TABLE file_activity ADD COLUMN owner_username VARCHAR(128) REFERENCES users(username)');
    await db.runSql('ALTER TABLE file_activity ADD COLUMN owner_groupfolder VARCHAR(128) REFERENCES groupfolders(id)');
    await db.runSql('CREATE INDEX IF NOT EXISTS file_activity_owner_path_idx ON file_activity (owner_username, owner_groupfolder, file_path, created_at DESC)');
};

exports.down = async function(db) {
    const result = await db.runSql(`SELECT column_name FROM information_schema.columns WHERE table_name = 'file_activity' AND column_name = 'owner_username'`);
    if (result.rows.length === 0) return;

    await db.runSql('DROP INDEX IF EXISTS file_activity_owner_path_idx');
    await db.runSql('ALTER TABLE file_activity DROP COLUMN owner_username');
    await db.runSql('ALTER TABLE file_activity DROP COLUMN owner_groupfolder');
    await db.runSql('ALTER TABLE file_activity ADD COLUMN owner VARCHAR(128) NOT NULL');
    await db.runSql('CREATE INDEX IF NOT EXISTS file_activity_owner_path_idx ON file_activity (owner, file_path, created_at DESC)');
};
