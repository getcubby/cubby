#!/usr/bin/env node

'use strict';

var constants = require('./backend/constants.js'),
    database = require('./backend/database.js'),
    fs = require('fs'),
    config = require('./backend/config.js'),
    diskusage = require('./backend/diskusage.js'),
    server = require('./backend/server.js');

function exit(error) {
    if (error) console.error(error);
    process.exit(error ? 1 : 0);
}

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

// we shall crash if this fails
diskusage.calculate();

// currently just update this every hour to put less strain on the disk
setInterval(diskusage.calculate, 1000 * 60 * 60);

server.init(async function (error) {
    if (error) exit(error);

    console.log(`Using data folder at: ${constants.USER_DATA_ROOT}`);
    console.log('Cubby is up and running.');

    // // create test group
    // const groups = require('./backend/groups.js');
    // try {
    //     await groups.add('family', 'Family', [ 'admin', 'helena' ]);
    // } catch (e) {
    //     console.error('---', e);
    // }
});
