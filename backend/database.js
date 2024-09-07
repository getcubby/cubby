exports = module.exports = {
    init,
    query,
    transaction
};

const assert = require('assert'),
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
    gConnectionPool.on('error', function (error) {
        console.error('Unexpected error on idle client', error);
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

async function transaction(queries) {
    assert(Array.isArray(queries));

    if (!gConnectionPool) throw new MainError(MainError.DATABASE_ERROR, 'database.js not initialized');

    try {
        await gConnectionPool.query('BEGIN');
        for (const query of queries) {
            await gConnectionPool.query(query.query, query.args);
        }
        await gConnectionPool.query('COMMIT');
    } catch (error) {
        await gConnectionPool.query('ROLLBACK');
        throw new MainError(MainError.DATABASE_ERROR, error);
    }
}
