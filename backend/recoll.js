exports = module.exports = {
    index,
    indexByUsername,
    indexByGroupFolder,

    searchByUsername
};

const assert = require('assert'),
    constants = require('./constants.js'),
    debug = require('debug')('cubby:search'),
    exec = require('./exec.js'),
    files = require('./files.js'),
    fs = require('fs'),
    groupFolders = require('./groupfolders.js'),
    path = require('path'),
    users = require('./users.js');

async function index() {
    const userList = await users.list();
    for (const user of userList) await indexByUsername(user.username);
}

// TODO provide faster index operations on individual paths:
// recollindex -e [<filepath [path ...]>]
//     Purge data for individual files. No stem database updates.
//     Reads paths on stdin if none is given as argument.
// recollindex -i [-f] [-Z] [-P] [<filepath [path ...]>]
//     Index individual files. No database purge or stem database updates
//     Will read paths on stdin if none is given as argument
//     -f : ignore skippedPaths and skippedNames while doing this
//     -Z : force reindex of each file
//     -P : force running a purge pass (very special use, don't do this if not sure)
// recollindex -r [-K] [-f] [-Z] [-p pattern] <top>
//    Recursive partial reindex.
//      -p : filter file names, multiple instances are allowed, e.g.:
//         -p *.odt -p *.pdf
//      -K : skip previously failed files (they are retried by default)

async function indexByUsername(username) {
    assert.strictEqual(typeof username, 'string');

    debug(`indexByUsername: ${username} ...`);

    const configPath = path.join(constants.SEARCH_INDEX_PATH, username);
    const configFilePath = path.join(configPath, 'recoll.conf');

    fs.mkdirSync(configPath, { recursive: true });

    // collect all paths we want to index and write config file
    const pathsToIndex = [ path.join(constants.USER_DATA_ROOT, username) ];
    for (const groupFolder of await groupFolders.list(username)) {
        pathsToIndex.push(groupFolder.folderPath);
    }
    fs.writeFileSync(configFilePath, `topdirs = ${pathsToIndex.join(' ')}`);

    try {
        // we don't care about the huge stdout for now
        await exec('recollindex', [ '-c', configPath ], { stdio: ['ignore', 'ignore', 'pipe'] });
    } catch (e) {
        console.error('Failed to create or update recoll index for user.', e);
    }

    debug(`indexByUsername: ${username} done`);
}

async function indexByGroupFolder(groupFolder) {
    assert.strictEqual(typeof groupFolder, 'string');

    debug(`indexByGroupFolder: ${groupFolder} ...`);

    const folder = await groupFolders.get(groupFolder);
    for (const member of folder.members) await indexByUsername(member);

    debug(`indexByGroupFolder: ${groupFolder} done`);
}

async function searchByUsername(username, query) {
    assert.strictEqual(typeof username, 'string');
    assert.strictEqual(typeof query, 'string');

    debug(`searchByUsername: ${username} ${query}`);

    const configPath = path.join(constants.SEARCH_INDEX_PATH, username);
    const dbFilePath = path.join(configPath, 'xapiandb');
    if (!fs.existsSync(dbFilePath)) await indexByUsername(username);

    const out = await exec('recoll', [ '-t', '-F', 'url filename abstract', '-c', configPath, query ]);

    const fileNameMatch = [];
    const fileContentMatch = [];

    // first two lines and last are info
    for (const line of out.split('\n').slice(2).slice(0, -1)) {
        const parts = line.split(' ');
        const filePath = Buffer.from(parts[0], 'base64').toString();
        const fileName = Buffer.from(parts[1], 'base64').toString();
        const abstract = Buffer.from(parts[2], 'base64').toString();

        // skip archives
        if (!filePath.endsWith(fileName)) continue;

        let entry;
        try {
            entry = await files.getByAbsolutePath(filePath.slice('file://'.length));
        } catch (e) {
            debug(`searchByUsername: Entry not found for ${filePath}`, e);
        }

        // skip
        if (!entry) continue;

        const result = {
            filePath,
            fileName,
            abstract,
            entry: entry.withoutPrivate()
        };

        if (fileName.indexOf(query) !== -1) fileNameMatch.push(result);
        else fileContentMatch.push(result);
    }

    return fileNameMatch.concat(fileContentMatch);
}
