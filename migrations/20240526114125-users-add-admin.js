'use strict';

exports.up = async function(db) {
    await db.runSql('ALTER TABLE users ADD COLUMN admin BOOLEAN DEFAULT FALSE');
};

exports.down = async function(db) {
    await db.runSql('ALTER TABLE users DROP COLUMN admin');
};
