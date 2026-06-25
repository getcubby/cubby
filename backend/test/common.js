import database from '../database.js';
import files from '../files.js';
import fs from 'node:fs';
import nock from 'nock';
import recent from '../recent.js';
import tokens from '../tokens.js';
import users from '../users.js';

const admin = {
    username: 'testadmin',
    email: 'admin@test.local',
    displayName: 'Test Admin',
    admin: false,
    token: null
};

const user = {
    username: 'testuser',
    email: 'user@test.local',
    displayName: 'Test User',
    admin: false,
    token: null
};

async function databaseSetup() {
    nock.cleanAll();
    database.init();
    await database._clear();
    recent._resetCache();

    for (const dir of [ process.env.USER_DATA_PATH, process.env.GROUPS_DATA_PATH, process.env.SEARCH_INDEX_PATH ]) {
        if (!dir || !fs.existsSync(dir)) continue;
        for (const entry of fs.readdirSync(dir)) {
            fs.rmSync(`${dir}/${entry}`, { recursive: true, force: true });
        }
    }
}

async function setup() {
    await databaseSetup();

    await users.add(admin);
    await users.setAdmin(admin.username, true);
    admin.token = await tokens.add(admin.username);

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

    for (const dir of [ process.env.USER_DATA_PATH, process.env.GROUPS_DATA_PATH, process.env.SEARCH_INDEX_PATH ]) {
        if (!dir || !fs.existsSync(dir)) continue;
        for (const entry of fs.readdirSync(dir)) {
            fs.rmSync(`${dir}/${entry}`, { recursive: true, force: true });
        }
    }
}

export default {
    admin,
    user,
    databaseSetup,
    setup,
    addUserWithHome,
    addUserFile,
    cleanup
};
