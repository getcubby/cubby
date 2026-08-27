'use strict';

exports.up = async function(db) {
    await db.runSql('DROP TABLE IF EXISTS settings');
};

exports.down = async function(db) {
    await db.runSql(`CREATE TABLE IF NOT EXISTS settings(
        name VARCHAR(128) NOT NULL PRIMARY KEY,
        value TEXT
    )`);
};
