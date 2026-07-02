'use strict';

function ownerToDbColumns(owner) {
    if (owner.indexOf('groupfolder-') === 0) {
        return {
            ownerUsername: null,
            ownerGroupfolder: owner.slice('groupfolder-'.length)
        };
    }

    return {
        ownerUsername: owner,
        ownerGroupfolder: null
    };
}

exports.up = async function(db) {
    const result = await db.runSql(`SELECT column_name FROM information_schema.columns WHERE table_name = 'favorites' AND column_name = 'owner'`);
    if (result.rows.length === 0) return;

    await db.runSql('ALTER TABLE favorites ADD COLUMN owner_username VARCHAR(128)');
    await db.runSql('ALTER TABLE favorites ADD COLUMN owner_groupfolder VARCHAR(128)');

    const favorites = await db.runSql('SELECT id, owner FROM favorites');
    for (const row of favorites.rows) {
        const { ownerUsername, ownerGroupfolder } = ownerToDbColumns(row.owner);
        await db.runSql('UPDATE favorites SET owner_username = ?, owner_groupfolder = ? WHERE id = ?', [
            ownerUsername, ownerGroupfolder, row.id
        ]);
    }

    await db.runSql('ALTER TABLE favorites DROP COLUMN owner');
    await db.runSql('ALTER TABLE favorites ADD CONSTRAINT favorites_owner_username_fkey FOREIGN KEY (owner_username) REFERENCES users(username)');
    await db.runSql('ALTER TABLE favorites ADD CONSTRAINT favorites_owner_groupfolder_fkey FOREIGN KEY (owner_groupfolder) REFERENCES groupfolders(id)');
};

exports.down = async function(db) {
    const result = await db.runSql(`SELECT column_name FROM information_schema.columns WHERE table_name = 'favorites' AND column_name = 'owner_username'`);
    if (result.rows.length === 0) return;

    await db.runSql('ALTER TABLE favorites DROP CONSTRAINT IF EXISTS favorites_owner_username_fkey');
    await db.runSql('ALTER TABLE favorites DROP CONSTRAINT IF EXISTS favorites_owner_groupfolder_fkey');
    await db.runSql('ALTER TABLE favorites ADD COLUMN owner VARCHAR(128)');

    const favorites = await db.runSql('SELECT id, owner_username, owner_groupfolder FROM favorites');
    for (const row of favorites.rows) {
        const owner = row.owner_groupfolder ? `groupfolder-${row.owner_groupfolder}` : row.owner_username;
        await db.runSql('UPDATE favorites SET owner = ? WHERE id = ?', [ owner, row.id ]);
    }

    await db.runSql('ALTER TABLE favorites DROP COLUMN owner_username');
    await db.runSql('ALTER TABLE favorites DROP COLUMN owner_groupfolder');
};
