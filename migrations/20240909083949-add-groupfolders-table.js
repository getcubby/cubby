'use strict';

exports.up = async function(db) {
    await db.runSql(`CREATE TABLE groupfolders (
        id VARCHAR(128) NOT NULL UNIQUE,
        name VARCHAR(256) NOT NULL,
        folder_path VARCHAR(512) NOT NULL,

        PRIMARY KEY(id)
    )`);

    await db.runSql(`CREATE TABLE groupfolders_members (
        groupfolder_id VARCHAR(128) REFERENCES groupfolders(id),
        username VARCHAR(128) REFERENCES users(username),

        UNIQUE (groupfolder_id, username)
    )`);
};

exports.down = async function(db) {
    await db.runSql('DROP TABLE groupfolders_members, groupfolders');
};
