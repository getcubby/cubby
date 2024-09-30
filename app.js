#!/usr/bin/env node

const constants = require('./backend/constants.js'),
    config = require('./backend/config.js'),
    database = require('./backend/database.js'),
    diskusage = require('./backend/diskusage.js'),
    fs = require('fs'),
    path = require('path'),
    recoll = require('./backend/recoll.js'),
    server = require('./backend/server.js'),
    users = require('./backend/users.js');

database.init();
config.init(process.env.CONFIG_FILE_PATH || 'config.json');

// ensure data directories or crash
fs.mkdirSync(constants.USER_DATA_ROOT, { recursive: true });
fs.mkdirSync(constants.GROUPS_DATA_ROOT, { recursive: true });
fs.mkdirSync(constants.THUMBNAIL_ROOT, { recursive: true });
fs.mkdirSync(constants.SESSION_PATH, { recursive: true });

if (!fs.existsSync(constants.SESSION_SECRET_FILE_PATH)) {
    console.log('Generating new session secret...');
    fs.writeFileSync(constants.SESSION_SECRET_FILE_PATH, require('crypto').randomBytes(20).toString('hex'), 'utf8');
}

server.init(async function (error) {
    if (error) {
        console.error(error);
        process.exit(error ? 1 : 0);
    }

    console.log(`Using data folder at: ${constants.USER_DATA_ROOT}`);
    console.log('Cubby is up and running.');

    // ensure at least users home dirs
    const userList = await users.list();
    for (const user of userList) fs.mkdirSync(path.join(constants.USER_DATA_ROOT, user.username), { recursive: true });

    // refresh data in background
    diskusage.calculate();
    recoll.index();
});
