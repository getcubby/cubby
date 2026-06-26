'use strict';

const fs = require('fs');
const path = require('path');
const pg = require('pg');

function isGroupfolder(owner) {
    return owner.indexOf('groupfolder-') === 0;
}

function getDataRoots() {
    return {
        userDataRoot: path.resolve(process.env.USER_DATA_PATH),
        groupsDataRoot: path.resolve(process.env.GROUPS_DATA_PATH)
    };
}

function getAbsolutePath(userDataRoot, groupsDataRoot, owner, filePath) {
    const dataRoot = isGroupfolder(owner) ? groupsDataRoot : userDataRoot;
    const identifier = isGroupfolder(owner) ? owner.slice('groupfolder-'.length) : owner;
    const fullFilePath = path.resolve(path.join(dataRoot, identifier, filePath));
    const ownerRoot = path.join(dataRoot, identifier);

    if (fullFilePath.indexOf(ownerRoot) !== 0) return null;

    return fullFilePath;
}

function pathExists(userDataRoot, groupsDataRoot, owner, filePath) {
    const fullFilePath = getAbsolutePath(userDataRoot, groupsDataRoot, owner, filePath);
    return !!fullFilePath && fs.existsSync(fullFilePath);
}

function shareOwner(row) {
    if (row.owner_username) return row.owner_username;
    if (row.owner_groupfolder) return `groupfolder-${row.owner_groupfolder}`;

    return null;
}

exports.up = async function() {
    if (!process.env.USER_DATA_PATH || !process.env.GROUPS_DATA_PATH) return;

    const { userDataRoot, groupsDataRoot } = getDataRoots();
    const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();

    try {
        const favorites = await client.query('SELECT id, owner, file_path FROM favorites');
        for (const row of favorites.rows) {
            if (!pathExists(userDataRoot, groupsDataRoot, row.owner, row.file_path)) {
                await client.query('DELETE FROM favorites WHERE id = $1', [ row.id ]);
            }
        }

        const shares = await client.query('SELECT id, owner_username, owner_groupfolder, file_path FROM shares');
        for (const row of shares.rows) {
            const owner = shareOwner(row);
            if (!owner || !pathExists(userDataRoot, groupsDataRoot, owner, row.file_path)) {
                await client.query('DELETE FROM shares WHERE id = $1', [ row.id ]);
            }
        }
    } finally {
        await client.end();
    }
};

exports.down = async function() {
    // one-way data cleanup
};
