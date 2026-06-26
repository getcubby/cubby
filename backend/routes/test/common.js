import crypto from 'node:crypto';
import database from '../../database.js';
import fs from 'node:fs';
import modelCommon from '../../test/common.js';
import paths from '../../paths.js';
import server from '../../server.js';

const PORT = process.env.PORT || 3456;
const serverUrl = `http://127.0.0.1:${PORT}`;

function ensureRuntimeDirs() {
    if (!fs.existsSync(paths.SESSION_SECRET_FILE_PATH)) {
        fs.writeFileSync(paths.SESSION_SECRET_FILE_PATH, crypto.randomBytes(20).toString('hex'), 'utf8');
    }
}

async function setupServer() {
    database.init();
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
