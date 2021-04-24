'use strict';

exports = module.exports = {
    login,
    sync
};

var assert = require('assert'),
    ldapjs = require('ldapjs'),
    debug = require('debug')('cubby:ldap'),
    promisify = require('util').promisify,
    MainError = require('./mainerror.js');

const LDAP_URL = process.env.CLOUDRON_LDAP_URL;
const LDAP_USERS_BASE_DN = process.env.CLOUDRON_LDAP_USERS_BASE_DN;
const LDAP_BIND_DN = process.env.CLOUDRON_LDAP_BIND_DN;
const LDAP_BIND_PASSWORD = process.env.CLOUDRON_LDAP_BIND_PASSWORD;

// https://tools.ietf.org/search/rfc4515#section-3
function sanitizeInput(username) {
    return username
        .replace(/\*/g, '\\2a')
        .replace(/\(/g, '\\28')
        .replace(/\)/g, '\\29')
        .replace(/\\/g, '\\5c')
        .replace(/\0/g, '\\00')
        .replace(/\//g, '\\2f');
}

async function login(username, password) {
    assert.strictEqual(typeof username, 'string');
    assert.strictEqual(typeof password, 'string');

    if (!LDAP_URL) return false;
    if (username === '' || password === '') return false;

    debug('ldap: login attempt for ' + username);

    var ldapClient = ldapjs.createClient({ url: LDAP_URL });
    ldapClient.on('error', function (error) {
        console.error('LDAP error', error);
    });

    function searchAndBind(callback) {
        ldapClient.bind(LDAP_BIND_DN, LDAP_BIND_PASSWORD, function (error) {
            if (error) return callback(new MainError(MainError.LDAP_ERROR, error));

            username = sanitizeInput(username);

            var filter = `(|(uid=${username})(mail=${username})(username=${username})(sAMAccountName=${username}))`;
            ldapClient.search(LDAP_USERS_BASE_DN, { filter: filter }, function (error, result) {
                if (error) return callback(new MainError(MainError.LDAP_ERROR, error));

                var items = [];

                result.on('searchEntry', function(entry) { items.push(entry.object); });
                result.on('error', function (error) { callback(new MainError(MainError.LDAP_ERROR, error)); });
                result.on('end', function (result) {
                    if (result.status !== 0 || items.length === 0) return callback(new MainError(MainError.ACCESS_DENIED));

                    // pick the first found
                    var user = items[0];

                    console.log('found user:', user);

                    ldapClient.bind(user.dn, password, function (error) {
                        if (error) return callback(new MainError(MainError.ACCESS_DENIED));

                        callback(null);
                    });
                });
            });
        });
    }

    try {
      await promisify(searchAndBind)();
      return true;
    } catch (error) {
        return false;
    }
}

async function sync() {
}