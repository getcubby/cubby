exports = module.exports = {
    index,
    indexByUsername,

    searchByUsername
};

const assert = require('assert'),
    constants = require('./constants.js'),
    debug = require('debug')('cubby:search'),
    exec = require('./exec.js'),
    fs = require('fs'),
    path = require('path'),
    users = require('./users.js');

async function index() {
    const userList = await users.list();
    for (const user of userList) await indexByUsername(user.username);
}

async function indexByUsername(username) {
    assert.strictEqual(typeof username, 'string');

    debug(`indexByUsername: ${username} ...`);

    const configPath = path.join(constants.SEARCH_INDEX_PATH, username);
    const configFilePath = path.join(configPath, 'recoll.conf');

    fs.mkdirSync(configPath, { recursive: true });
    if (!fs.existsSync(configFilePath)) fs.writeFileSync(configFilePath, `topdirs = ${path.join(constants.USER_DATA_ROOT, username)}`);

    await exec('index', 'recollindex', [ '-c', configPath ], {});

    debug(`indexByUsername: ${username} done`);
}

async function searchByUsername(username, query) {
    assert.strictEqual(typeof username, 'string');
    assert.strictEqual(typeof query, 'string');

    debug(`searchByUsername: ${username} ${query}`);

    const configPath = path.join(constants.SEARCH_INDEX_PATH, username);
    const dbFilePath = path.join(configPath, 'xapiandb');
    if (!fs.existsSync(dbFilePath)) await indexByUsername(username);

    const out = await exec('search', 'recoll', [ '-t', '-F', 'mtype url filename', '-c', configPath, query ], {});

    // console.log(out)
    const results = [];

    // first two lines and last are info
    for (const line of out.split('\n').slice(2).slice(0, -1)) {
        const parts = line.split(' ');
        results.push({
            mimeType: Buffer.from(parts[0], 'base64').toString(),
            filePath: Buffer.from(parts[1], 'base64').toString(),
            fileName: Buffer.from(parts[2], 'base64').toString()
        });
    }

    return results;
}
