#!/usr/bin/env node

import database from './backend/database.js';
import diskusage from './backend/diskusage.js';
import fs from 'fs';
import paths from './backend/paths.js';
import path from 'path';
import recoll from './backend/recoll.js';
import server from './backend/server.js';
import users from './backend/users.js';
import crypto from 'crypto';

database.init();

if (!fs.existsSync(paths.SESSION_SECRET_FILE_PATH)) {
    console.log('Generating new session secret...');
    fs.writeFileSync(paths.SESSION_SECRET_FILE_PATH, crypto.randomBytes(20).toString('hex'), 'utf8');
}

(async () => {
    try {
        await server.init();
        console.log(`Using data folder at: ${paths.dataRoot()}`);
        console.log('Cubby is up and running.');

        // ensure at least users home dirs
        const userList = await users.list();
        for (const user of userList) fs.mkdirSync(path.join(paths.USER_DATA_ROOT, user.username), { recursive: true });

        // refresh data in background
        diskusage.calculate();
        recoll.index();
    } catch (error) {
        console.error(error);
        process.exit(1);
    }
})();
