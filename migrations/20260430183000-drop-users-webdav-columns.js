'use strict';

exports.up = async function(db) {
    await db.runSql('ALTER TABLE users DROP COLUMN IF EXISTS password, DROP COLUMN IF EXISTS salt');
};

exports.down = async function(db) {
    await db.runSql("ALTER TABLE users ADD COLUMN IF NOT EXISTS password VARCHAR(1024) NOT NULL DEFAULT ''");
    await db.runSql("ALTER TABLE users ADD COLUMN IF NOT EXISTS salt VARCHAR(512) NOT NULL DEFAULT ''");
};
