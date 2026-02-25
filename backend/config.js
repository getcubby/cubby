import assert from 'assert';
import debug from 'debug';
import fs from 'fs';
import path from 'path';
import safe from 'safetydance';

const debugLog = debug('cubby:config');

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
        gConfig = JSON.parse(fs.readFileSync(gConfigFilePath, 'utf8'));
    } catch (e) { // eslint-disable-line
        debugLog(`Unable to load config file at ${gConfigFilePath}. Using defaults.`);
    }

    debugLog('loaded config:', gConfig);
}

function commit() {
    debugLog('commit settings', gConfig);

    try {
        fs.writeFileSync(gConfigFilePath, JSON.stringify(gConfig, null, 4));
    } catch (e) {
        debugLog(`Unable to safe config file at ${gConfigFilePath}.`, e);
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

export default {
    init,
    get,
    set
};
