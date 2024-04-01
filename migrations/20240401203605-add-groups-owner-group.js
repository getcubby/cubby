'use strict';

exports.up = async function(db) {
    await db.runSql('ALTER TABLE shares ADD COLUMN owner_group VARCHAR(128)');
    await db.runSql('ALTER TABLE shares ADD CONSTRAINT ownerGroupConstraint FOREIGN KEY(owner_group) REFERENCES groups(id)');
};

exports.down = async function(db) {
    await db.runSql('ALTER TABLE shares DROP CONSTRAINT ownerGroupConstraint');
    await db.runSql('ALTER TABLE shares DROP COLUMN owner_group RESTRICT');
};
