exports.up = async function(db) {
    // first remove old group stuff
    await db.runSql('ALTER TABLE shares DROP CONSTRAINT ownerGroupConstraint');
    await db.runSql('ALTER TABLE shares DROP COLUMN owner_group RESTRICT');

    // now add new groupfolders stuff
    await db.runSql('ALTER TABLE shares ADD COLUMN owner_groupfolder VARCHAR(128)');
    await db.runSql('ALTER TABLE shares ADD CONSTRAINT ownerGroupFolderConstraint FOREIGN KEY(owner_groupfolder) REFERENCES groupfolders(id)');
};

exports.down = async function(db) {
    await db.runSql('ALTER TABLE shares ADD COLUMN owner_group VARCHAR(128)');
    await db.runSql('ALTER TABLE shares ADD CONSTRAINT ownerGroupConstraint FOREIGN KEY(owner_group) REFERENCES groups(id)');

    await db.runSql('ALTER TABLE shares DROP CONSTRAINT ownerGroupFolderConstraint');
    await db.runSql('ALTER TABLE shares DROP COLUMN owner_groupfolder RESTRICT');
};
