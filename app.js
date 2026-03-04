#!/usr/bin/env node

import constants from './backend/constants.js';
import config from './backend/config.js';
import database from './backend/database.js';
import diskusage from './backend/diskusage.js';
import fs from 'fs';
import path from 'path';
import recoll from './backend/recoll.js';
import server from './backend/server.js';
import users from './backend/users.js';
import crypto from 'crypto';

database.init();
config.init(process.env.CONFIG_FILE_PATH || 'config.json');

// ensure data directories or crash
fs.mkdirSync(constants.USER_DATA_ROOT, { recursive: true });
fs.mkdirSync(constants.GROUPS_DATA_ROOT, { recursive: true });
fs.mkdirSync(constants.THUMBNAIL_ROOT, { recursive: true });
fs.mkdirSync(constants.SESSION_PATH, { recursive: true });

if (!fs.existsSync(constants.SESSION_SECRET_FILE_PATH)) {
    console.log('Generating new session secret...');
    fs.writeFileSync(constants.SESSION_SECRET_FILE_PATH, crypto.randomBytes(20).toString('hex'), 'utf8');
}

(async () => {
    try {
        await server.init();
        console.log(`Using data folder at: ${constants.USER_DATA_ROOT}`);
        console.log('Cubby is up and running.');

        // ensure at least users home dirs
        const userList = await users.list();
        for (const user of userList) fs.mkdirSync(path.join(constants.USER_DATA_ROOT, user.username), { recursive: true });

        // refresh data in background
        diskusage.calculate();
        recoll.index();
    } catch (error) {
        console.error(error);
        process.exit(1);
    }
})();
