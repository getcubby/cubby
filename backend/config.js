'use strict';

exports = module.exports = {
    init,
    get,
    set
};

var assert = require('assert'),
    debug = require('debug')('cubby:config'),
    fs = require('fs'),
    path = require('path'),
    safe = require('safetydance');

let gConfig = {
    collabora: {
        host: ''
    }
};

let gConfigFilePath = null;

function init(configFilePath) {
    assert.strictEqual(typeof configFilePath, 'string');

    gConfigFilePath = path.resolve(configFilePath);

    try {
        gConfig = require(gConfigFilePath);
    } catch (e) {
        debug(`Unable to load config file at ${gConfigFilePath}. Using defaults.`);
    }

    debug('loaded config:', gConfig);
}

function commit() {
    debug('commit settings', gConfig);

    try {
        fs.writeFileSync(gConfigFilePath, JSON.stringify(gConfig, null, 4));
    } catch (e) {
        debug(`Unable to safe config file at ${gConfigFilePath}.`, e);
        throw e;
    }
}

// fallback is optional
function get(key, fallback) {
    assert.strictEqual(typeof key, 'string');

    return safe.query(gConfig, key, fallback);
}

// currently only toplevel keys
function set(key, value) {
    assert.strictEqual(typeof key, 'string');

    gConfig[key] = value;

    commit();
}
