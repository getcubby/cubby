'use strict';

exports.up = async function(db) {
    await db.runSql(`CREATE TABLE groups (
        id VARCHAR(128) NOT NULL UNIQUE,
        name VARCHAR(256) NOT NULL,

        PRIMARY KEY(id)
    )`);

    await db.runSql(`CREATE TABLE group_members (
        group_id VARCHAR(128) REFERENCES groups(id),
        username VARCHAR(128) REFERENCES users(username),

        UNIQUE (group_id, username)
    )`);
};

exports.down = async function(db) {
    await db.runSql('DROP TABLE group_members, groups');
};
