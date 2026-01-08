'use strict';

exports = module.exports = {
    create,
    list,
    get,
    remove
};

var assert = require('assert'),
    debug = require('debug')('cubby:routes:favorites'),
    favorites = require('../favorites.js'),
    files = require('../files.js'),
    HttpError = require('connect-lastmile').HttpError,
    HttpSuccess = require('connect-lastmile').HttpSuccess;

async function create(req, res, next) {
    assert.strictEqual(typeof req.user, 'object');

    if (!req.body.path) return next(new HttpError(400, 'path must be a non-empty string'));

    const filePath = req.body.path.replace(/\/+/g, '/');
    const owner = req.body.owner || req.user.username; // user can favorite a filePath owned by another (when shared)

    debug(`create: owner:${owner} ${filePath}`);

    let id;
    try {
        id = await favorites.create(req.user.username, owner, filePath);
    } catch (error) {
        return next(new HttpError(500, error));
    }

    next(new HttpSuccess(200, { id }));
}

async function list(req, res, next) {
    assert.strictEqual(typeof req.user, 'object');

    debug(`list: for ${req.user.username}`);

    let result = [];

    try {
        result = await favorites.list(req.user.username);
    } catch (error) {
        return next(new HttpError(500, error));
    }

    const validFavorites = [];
    // Collect all file entries from favorites
    for (const favorite of result) {
        let file;
        try {
            file = await files.get(favorite.owner, favorite.filePath);
        } catch (error) {
            console.error('Favorite does not map to a file or folder', favorite, error);
        }

        if (!file) continue;

        validFavorites.push(file.withoutPrivate(req.user.username));
    }

    next(new HttpSuccess(200, { favorites: validFavorites }));
}

async function get(req, res, next) {
    assert.strictEqual(typeof req.user, 'object');

    debug(`get: ${req.params.id}`);

    let result;
    try {
        result = await favorites.get(req.params.id);
    } catch (error) {
        return next(new HttpError(500, error));
    }

    if (!result) return next(new HttpError(404, 'favorite does not exist'));

    let file;
    try {
        file = await files.get(result.owner, result.filePath);
    } catch (error) {
        console.error('Favorite does not map to a file or folder', result, error);
    }

    if (!file) return next(new HttpError(409, 'favorite does not map to a file'));

    next(new HttpSuccess(200, {}));
}

async function remove(req, res, next) {
    assert.strictEqual(typeof req.user, 'object');

    debug(`remove: ${req.params.id}`);

    try {
        await favorites.remove(req.params.id);
    } catch (error) {
        return next(new HttpError(500, error));
    }

    next(new HttpSuccess(200, {}));
}
