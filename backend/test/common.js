import database from '../database.js';
import files from '../files.js';
import fs from 'node:fs';
import nock from 'nock';
import paths from '../paths.js';
import tokens from '../tokens.js';
import users from '../users.js';

const alice = {
    username: 'alice',
    email: 'alice@test.local',
    displayName: 'Alice',
    token: null
};

const user = {
    username: 'testuser',
    email: 'user@test.local',
    displayName: 'Test User',
    token: null
};

async function databaseSetup() {
    nock.cleanAll();
    database.init();
    await database._clear();

    for (const dir of [ paths.USER_DATA_ROOT, paths.GROUPS_DATA_ROOT, paths.SEARCH_INDEX_PATH ]) {
        if (!fs.existsSync(dir)) continue;
        for (const entry of fs.readdirSync(dir)) {
            fs.rmSync(`${dir}/${entry}`, { recursive: true, force: true });
        }
    }
}

async function setup() {
    await databaseSetup();

    await users.add(alice);
    alice.token = await tokens.add(alice.username);

    await users.add(user);
    user.token = await tokens.add(user.username);
}

async function addUserWithHome(userData) {
    await users.add(userData);
}

async function addUserFile(username, filePath, content = 'hello') {
    await files.addOrOverwriteFileContents(username, filePath, Buffer.from(content), null, true);
}

async function cleanup() {
    nock.cleanAll();
    await database.uninitialize();

    for (const dir of [ paths.USER_DATA_ROOT, paths.GROUPS_DATA_ROOT, paths.SEARCH_INDEX_PATH ]) {
        if (!fs.existsSync(dir)) continue;
        for (const entry of fs.readdirSync(dir)) {
            fs.rmSync(`${dir}/${entry}`, { recursive: true, force: true });
        }
    }
}

export default {
    alice,
    user,
    databaseSetup,
    setup,
    addUserWithHome,
    addUserFile,
    cleanup
};
