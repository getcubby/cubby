'use strict';

exports.up = async function(db) {
    await db.runSql('ALTER TABLE groupfolders DROP COLUMN IF EXISTS folder_path');
};

exports.down = async function(db) {
    await db.runSql("ALTER TABLE groupfolders ADD COLUMN folder_path VARCHAR(512) NOT NULL DEFAULT ''");
};
