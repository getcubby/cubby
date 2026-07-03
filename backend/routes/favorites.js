import assert from 'assert';
import debug from 'debug';
import favorites from '../favorites.js';
import MainError from '../mainerror.js';
import { HttpError, HttpSuccess } from '@cloudron/connect-lastmile';
import safe from '@cloudron/safetydance';

const debugLog = debug('cubby:routes:favorites');

async function create(req, res, next) {
    assert.strictEqual(typeof req.user, 'object');

    if (!req.body.path) return next(new HttpError(400, 'path must be a non-empty string'));

    const filePath = req.body.path.replace(/\/+/g, '/');
    const shareId = req.body.shareId || null;

    let createArgs;
    if (shareId) {
        debugLog(`create: share:${shareId} ${filePath}`);
        createArgs = { shareId, filePath };
    } else {
        const owner = req.body.owner || req.user.username;
        debugLog(`create: owner:${owner} ${filePath}`);
        createArgs = { owner, filePath };
    }

    const [error, id] = await safe(favorites.create(req.user.username, createArgs));
    if (error) return next(MainError.toHttpError(error));

    next(new HttpSuccess(200, { id }));
}

async function list(req, res, next) {
    assert.strictEqual(typeof req.user, 'object');

    debugLog(`list: for ${req.user.username}`);

    const [error, result] = await safe(favorites.list(req.user.username));
    if (error) return next(MainError.toHttpError(error));

    next(new HttpSuccess(200, { favorites: result }));
}

async function get(req, res, next) {
    assert.strictEqual(typeof req.user, 'object');

    debugLog(`get: ${req.params.id}`);

    const [error, result] = await safe(favorites.get(req.params.id));
    if (error) return next(MainError.toHttpError(error));
    if (!result) return next(new HttpError(404, 'favorite does not exist'));
    if (result.username !== req.user.username) return next(new HttpError(404, 'favorite does not exist'));

    next(new HttpSuccess(200, { favorite: result }));
}

async function remove(req, res, next) {
    assert.strictEqual(typeof req.user, 'object');

    debugLog(`remove: ${req.params.id}`);

    const [error] = await safe(favorites.remove(req.params.id));
    if (error) return next(MainError.toHttpError(error));

    next(new HttpSuccess(200, {}));
}

export default {
    create,
    list,
    get,
    remove
};
