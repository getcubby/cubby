'use strict';

exports.up = async function(db) {
    // re-activate the legacy groups table for SCIM-synced groups
    await db.runSql(`ALTER TABLE groups ADD COLUMN source VARCHAR(16) NOT NULL DEFAULT ''`);
    await db.runSql(`DELETE FROM group_members`);
    await db.runSql(`DELETE FROM groups`);

    await db.runSql(`CREATE TABLE groupfolders_group_members (
        groupfolder_id VARCHAR(128) REFERENCES groupfolders(id) ON DELETE CASCADE,
        group_id VARCHAR(128) REFERENCES groups(id) ON DELETE CASCADE,
        role VARCHAR(16) NOT NULL DEFAULT 'editor',

        UNIQUE (groupfolder_id, group_id)
    )`);

    await db.runSql(`ALTER TABLE shares ADD COLUMN receiver_group VARCHAR(128)`);
    await db.runSql(`ALTER TABLE shares ADD CONSTRAINT receiverGroupConstraint FOREIGN KEY(receiver_group) REFERENCES groups(id) ON DELETE CASCADE`);
};

exports.down = async function(db) {
    await db.runSql(`ALTER TABLE shares DROP CONSTRAINT receiverGroupConstraint`);
    await db.runSql(`ALTER TABLE shares DROP COLUMN receiver_group`);
    await db.runSql(`DROP TABLE groupfolders_group_members`);
    await db.runSql(`ALTER TABLE groups DROP COLUMN source`);
};
