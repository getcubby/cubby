'use strict';

function parseResourcePath(resourcePath, opener) {
    resourcePath = resourcePath.replace(/\/+/g, '/');

    if (resourcePath.indexOf('/home') === 0) {
        return {
            shareId: null,
            ownerUsername: opener,
            ownerGroupfolder: null,
            filePath: resourcePath.slice('/home'.length) || '/'
        };
    }

    if (resourcePath.indexOf('/shares/') === 0) {
        const parts = resourcePath.slice(1).split('/');
        const shareId = parts[1];
        if (!shareId) return null;
        const rest = parts.slice(2).join('/');

        return {
            shareId,
            ownerUsername: null,
            ownerGroupfolder: null,
            filePath: rest ? '/' + rest : '/'
        };
    }

    if (resourcePath.indexOf('/groupfolders/') === 0) {
        const parts = resourcePath.slice(1).split('/');
        const groupId = parts[1];
        if (!groupId) return null;
        const rest = parts.slice(2).join('/');

        return {
            shareId: null,
            ownerUsername: null,
            ownerGroupfolder: groupId,
            filePath: rest ? '/' + rest : '/'
        };
    }

    return null;
}

exports.up = async function(db) {
    const result = await db.runSql(`SELECT column_name FROM information_schema.columns WHERE table_name = 'recents' AND column_name = 'share_id'`);
    if (result.rows.length > 0) return;

    await db.runSql('ALTER TABLE recents ADD COLUMN share_id VARCHAR(128)');
    await db.runSql('ALTER TABLE recents ADD COLUMN owner_username VARCHAR(128)');
    await db.runSql('ALTER TABLE recents ADD COLUMN owner_groupfolder VARCHAR(128)');
    await db.runSql('ALTER TABLE recents ADD COLUMN file_path VARCHAR(512)');

    const rows = await db.runSql('SELECT opener, resource_path FROM recents');
    for (const row of rows.rows) {
        const ref = parseResourcePath(row.resource_path, row.opener);
        if (!ref) {
            await db.runSql('DELETE FROM recents WHERE opener = ? AND resource_path = ?', [ row.opener, row.resource_path ]);
            continue;
        }

        await db.runSql('UPDATE recents SET share_id = ?, owner_username = ?, owner_groupfolder = ?, file_path = ? WHERE opener = ? AND resource_path = ?', [
            ref.shareId, ref.ownerUsername, ref.ownerGroupfolder, ref.filePath, row.opener, row.resource_path
        ]);
    }

    await db.runSql('DELETE FROM recents WHERE file_path IS NULL');
    await db.runSql('ALTER TABLE recents ALTER COLUMN file_path SET NOT NULL');
    await db.runSql('ALTER TABLE recents DROP CONSTRAINT recents_pkey');
    await db.runSql('ALTER TABLE recents DROP COLUMN resource_path');

    await db.runSql('ALTER TABLE recents ADD CONSTRAINT recents_share_id_fkey FOREIGN KEY (share_id) REFERENCES shares(id) ON DELETE CASCADE');
    await db.runSql('ALTER TABLE recents ADD CONSTRAINT recents_owner_username_fkey FOREIGN KEY (owner_username) REFERENCES users(username)');
    await db.runSql('ALTER TABLE recents ADD CONSTRAINT recents_owner_groupfolder_fkey FOREIGN KEY (owner_groupfolder) REFERENCES groupfolders(id)');

    await db.runSql('CREATE UNIQUE INDEX recents_opener_share_path ON recents (opener, share_id, file_path) WHERE share_id IS NOT NULL');
    await db.runSql('CREATE UNIQUE INDEX recents_opener_owner_path ON recents (opener, owner_username, owner_groupfolder, file_path) WHERE share_id IS NULL');
};

exports.down = async function(db) {
    const result = await db.runSql(`SELECT column_name FROM information_schema.columns WHERE table_name = 'recents' AND column_name = 'share_id'`);
    if (result.rows.length === 0) return;

    await db.runSql('DROP INDEX IF EXISTS recents_opener_share_path');
    await db.runSql('DROP INDEX IF EXISTS recents_opener_owner_path');
    await db.runSql('ALTER TABLE recents DROP CONSTRAINT IF EXISTS recents_share_id_fkey');
    await db.runSql('ALTER TABLE recents DROP CONSTRAINT IF EXISTS recents_owner_username_fkey');
    await db.runSql('ALTER TABLE recents DROP CONSTRAINT IF EXISTS recents_owner_groupfolder_fkey');

    await db.runSql('ALTER TABLE recents ADD COLUMN resource_path VARCHAR(512)');

    const rows = await db.runSql('SELECT opener, share_id, owner_username, owner_groupfolder, file_path FROM recents');
    for (const row of rows.rows) {
        let resourcePath;
        if (row.share_id) {
            const suffix = row.file_path === '/' ? '' : row.file_path;
            resourcePath = '/shares/' + row.share_id + suffix;
        } else if (row.owner_groupfolder) {
            resourcePath = '/groupfolders/' + row.owner_groupfolder + row.file_path;
        } else {
            resourcePath = '/home' + row.file_path;
        }

        await db.runSql('UPDATE recents SET resource_path = ? WHERE opener = ? AND file_path = ?', [
            resourcePath, row.opener, row.file_path
        ]);
    }

    await db.runSql('ALTER TABLE recents ALTER COLUMN resource_path SET NOT NULL');
    await db.runSql('ALTER TABLE recents DROP COLUMN share_id');
    await db.runSql('ALTER TABLE recents DROP COLUMN owner_username');
    await db.runSql('ALTER TABLE recents DROP COLUMN owner_groupfolder');
    await db.runSql('ALTER TABLE recents DROP COLUMN file_path');
    await db.runSql('ALTER TABLE recents ADD PRIMARY KEY (opener, resource_path)');
};
