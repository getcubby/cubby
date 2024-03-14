'use strict';

exports = module.exports = {
    init,
    query
};

var assert = require('assert'),
    MainError = require('./mainerror.js'),
    debug = require('debug')('cubby:database'),
    pg = require('pg');

var gConnectionPool = null;

const gDatabase = {
    hostname: process.env.POSTGRESQL_HOST || '127.0.0.1',
    username: process.env.POSTGRESQL_USERNAME || 'root',
    password: process.env.POSTGRESQL_PASSWORD || 'password',
    port: process.env.POSTGRESQL_PORT || 3306,
    name: process.env.POSTGRESQL_DATABASE || 'cubby'
};

function init() {
    if (gConnectionPool !== null) return;

    debug(`init: connecting to database ${gDatabase.name} on ${gDatabase.hostname}:${gDatabase.port}`);

    gConnectionPool = new pg.Pool({
        host: gDatabase.hostname,
        user: gDatabase.username,
        password: gDatabase.password,
        database: gDatabase.name,
        port: gDatabase.port,
    });

    // the pool will emit an error on behalf of any idle clients
    // it contains if a backend error or network partition happens
    gConnectionPool.on('error', function (error, client) {
        console.error('Unexpected error on idle client', error)
    });
}

async function query(sql, args) {
    assert.strictEqual(typeof sql, 'string');
    assert(typeof args === 'undefined' || Array.isArray(args));

    if (!gConnectionPool) throw new MainError(MainError.DATABASE_ERROR, 'database.js not initialized');

    try {
        return await gConnectionPool.query(sql, args);
    } catch (error) {
        throw new MainError(MainError.DATABASE_ERROR, error);
    }
}
