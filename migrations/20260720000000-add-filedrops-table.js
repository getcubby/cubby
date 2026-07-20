'use strict';

exports.up = async function(db) {
    await db.runSql(`CREATE TABLE IF NOT EXISTS filedrops (
        id VARCHAR(128) NOT NULL UNIQUE,
        owner_username VARCHAR(128),
        owner_groupfolder VARCHAR(128),
        file_path VARCHAR(256) NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP,

        FOREIGN KEY (owner_username) REFERENCES users(username),
        FOREIGN KEY (owner_groupfolder) REFERENCES groupfolders(id),
        PRIMARY KEY (id)
    )`);
};

exports.down = async function(db) {
    await db.runSql('DROP TABLE IF EXISTS filedrops');
};
