'use strict';

exports.up = async function(db) {
    await db.runSql(`CREATE TABLE IF NOT EXISTS recents(
        username VARCHAR(128) NOT NULL,
        resource_path VARCHAR(512) NOT NULL,
        accessed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

        FOREIGN KEY(username) REFERENCES users(username),
        PRIMARY KEY(username, resource_path));
    `);
};

exports.down = async function(db) {
    await db.runSql('DROP TABLE recents');
};
