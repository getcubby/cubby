exports = module.exports = {
    add,
    list,
    get,
    update,
    remove
};

var assert = require('assert'),
    debug = require('debug')('cubby:routes:groupfolders'),
    constants = require('../constants.js'),
    groupFolders = require('../groupfolders.js'),
    HttpError = require('connect-lastmile').HttpError,
    HttpSuccess = require('connect-lastmile').HttpSuccess,
    MainError = require('../mainerror.js'),
    path = require('path');

async function add(req, res, next) {
    assert.strictEqual(typeof req.user, 'object');
    assert(req.user.admin === true);

    const name = req.body.name;
    const folderPath = req.body.path || '';
    const members = req.body.members || [];
    const slug = req.body.slug || '';

    // TODO validate args

    debug(`add: ${name} at ${folderPath || path.join(constants.GROUPS_DATA_ROOT, name)} for members ${members.join(',')}`);

    try {
        await groupFolders.add(slug, name, folderPath, members);
    } catch (e) {
        if (e.reason === MainError.NOT_FOUND) return next(new HttpError(412, 'member not found'));
        if (e.reason === MainError.ALREADY_EXISTS) return next(new HttpError(412, 'slug already exists'));
        return next(new HttpError(500, e));
    }

    return next(new HttpSuccess(200, {}));
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

    const id = req.params.id;

    debug(`get: ${id}`);

    next(new HttpError(500, 'not implemented'));
}

async function update(req, res, next) {
    assert.strictEqual(typeof req.user, 'object');
    assert(req.user.admin === true);

    const id = req.params.id;
    const name = req.body.name;
    const members = req.body.members;

    // TODO validate args

    debug(`update: ${id} with ${name} and members ${members.join(',')}`);

    try {
        await groupFolders.update(id, name, members);
    } catch (e) {
        if (e.reason === MainError.NOT_FOUND) return next(new HttpError(412, 'member not found'));
        return next(new HttpError(500, e));
    }

    return next(new HttpSuccess(200, {}));
}

async function remove(req, res, next) {
    assert.strictEqual(typeof req.user, 'object');
    assert(req.user.admin === true);

    const id = req.params.id;

    debug(`remove: ${id}`);

    try {
        await groupFolders.remove(id);
    } catch (e) {
        return next(new HttpError(500, e));
    }

    return next(new HttpSuccess(200, {}));
}
