'use strict';

exports.up = async function(db) {
    await db.runSql(`CREATE TABLE IF NOT EXISTS favorites(
        id VARCHAR(128) NOT NULL UNIQUE,
        username VARCHAR(128),
        owner VARCHAR(128),
        file_path VARCHAR(256) NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

        FOREIGN KEY(username) REFERENCES users(username),
        PRIMARY KEY(id));
    `);
};

exports.down = async function(db) {
    await db.runSql('DROP TABLE favorites');
};
