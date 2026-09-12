'use strict';

exports.up = async function(db) {
    await db.runSql("ALTER TABLE groupfolders_members ADD COLUMN role VARCHAR(16) NOT NULL DEFAULT 'editor'");
    await db.runSql("UPDATE groupfolders_members SET role = 'owner'");
};

exports.down = async function(db) {
    await db.runSql('ALTER TABLE groupfolders_members DROP COLUMN role');
};
