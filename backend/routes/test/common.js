import config from '../../config.js';
import constants from '../../constants.js';
import crypto from 'node:crypto';
import database from '../../database.js';
import fs from 'node:fs';
import modelCommon from '../../test/common.js';
import path from 'node:path';
import server from '../../server.js';

const PORT = process.env.PORT || 3456;
const serverUrl = `http://127.0.0.1:${PORT}`;

function ensureRuntimeDirs() {
    fs.mkdirSync(constants.USER_DATA_ROOT, { recursive: true });
    fs.mkdirSync(constants.GROUPS_DATA_ROOT, { recursive: true });
    fs.mkdirSync(constants.THUMBNAIL_ROOT, { recursive: true });
    fs.mkdirSync(constants.SESSION_PATH, { recursive: true });
    fs.mkdirSync(constants.SEARCH_INDEX_PATH, { recursive: true });

    if (!fs.existsSync(constants.SESSION_SECRET_FILE_PATH)) {
        fs.writeFileSync(constants.SESSION_SECRET_FILE_PATH, crypto.randomBytes(20).toString('hex'), 'utf8');
    }
}

async function setupServer() {
    database.init();
    config.init(process.env.CONFIG_FILE_PATH || path.join(process.env.CUBBY_TEST_DIR || '', 'config.json'));
    ensureRuntimeDirs();
    await server.start();
}

async function setup() {
    await modelCommon.setup();
    await setupServer();
}

async function cleanup() {
    await server.stop();
    await modelCommon.cleanup();
}

function withToken(req, token) {
    return req.query({ access_token: token });
}

export default {
    admin: modelCommon.admin,
    user: modelCommon.user,
    serverUrl,
    setup,
    cleanup,
    withToken,
    addUserFile: modelCommon.addUserFile
};
