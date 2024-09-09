exports = module.exports = {
    add,
    list,
    get,
    update,
    remove
};

var assert = require('assert'),
    debug = require('debug')('cubby:routes:groupfolders'),
    groupFolders = require('../groupfolders.js'),
    HttpError = require('connect-lastmile').HttpError,
    HttpSuccess = require('connect-lastmile').HttpSuccess;

async function add(req, res, next) {
    assert.strictEqual(typeof req.user, 'object');
    assert(req.user.admin === true);

    debug(`add:`);

    next(new HttpError(500, 'not implemented'));
}

async function list(req, res, next) {
    assert.strictEqual(typeof req.user, 'object');
    assert(req.user.admin === true);

    debug(`list:`);

    try {
        const result = await groupFolders.list();
        return next(new HttpSuccess(200, { groupFolder: result }));
    } catch (error) {
        return next(new HttpError(500, error));
    }
}

async function get(req, res, next) {
    assert.strictEqual(typeof req.user, 'object');
    assert(req.user.admin === true);

    const groupFolderId = req.params.id;

    debug(`get: ${groupFolderId}`);

    next(new HttpError(500, 'not implemented'));
}

async function update(req, res, next) {
    assert.strictEqual(typeof req.user, 'object');
    assert(req.user.admin === true);

    const groupFolderId = req.params.id;

    debug(`update: ${groupFolderId}`);

    next(new HttpError(500, 'not implemented'));
}

async function remove(req, res, next) {
    assert.strictEqual(typeof req.user, 'object');
    assert(req.user.admin === true);

    const groupFolderId = req.params.id;

    debug(`remove: ${groupFolderId}`);

    next(new HttpError(500, 'not implemented'));
}
