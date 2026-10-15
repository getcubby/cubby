import assert from 'assert';
import debug from 'debug';
import favorites from '../favorites.js';
import MainError from '../mainerror.js';
import { HttpError, HttpSuccess } from '@cloudron/connect-lastmile';
import safe from '@cloudron/safetydance';
import shares from '../shares.js';
import sqlutil from '../sqlutil.js';
import { canReadOwner } from './utils.js';

const debugLog = debug('cubby:routes:favorites');

async function create(req, res, next) {
    assert.strictEqual(typeof req.user, 'object');

    if (!req.body.path) return next(new HttpError(400, 'path must be a non-empty string'));

    const filePath = req.body.path.replace(/\/+/g, '/');
    const shareId = req.body.shareId || null;

    let createArgs;
    if (shareId) {
        const [shareError, share] = await safe(shares.get(shareId));
        if (shareError) return next(MainError.toHttpError(shareError));
        if (!share || shares.isExpired(share)) return next(new HttpError(404, 'share not found'));
        if (!await shares.isReceiverAllowed(share, req.user.id)) return next(new HttpError(403, 'not allowed'));

        debugLog(`create: share:${shareId} ${filePath}`);
        createArgs = { shareId, filePath };
    } else {
        const owner = req.body.owner || req.user.id;
        if (typeof owner !== 'string') return next(new HttpError(400, 'owner must be a string'));

        const { ownerUserId, ownerGroupfolder } = sqlutil.ownerToDbColumns(owner);
        const [accessError, allowed] = await safe(canReadOwner(req.user.id, ownerUserId, ownerGroupfolder));
        if (accessError) return next(MainError.toHttpError(accessError));
        if (!allowed) return next(new HttpError(403, 'not allowed'));

        debugLog(`create: owner:${owner} ${filePath}`);
        createArgs = { owner, filePath };
    }

    const [error, id] = await safe(favorites.create(req.user.id, createArgs));
    if (error) return next(MainError.toHttpError(error));

    next(new HttpSuccess(200, { id }));
}

async function list(req, res, next) {
    assert.strictEqual(typeof req.user, 'object');

    debugLog(`list: for ${req.user.id}`);

    const [error, result] = await safe(favorites.list(req.user.id));
    if (error) return next(MainError.toHttpError(error));

    next(new HttpSuccess(200, { favorites: result }));
}

async function get(req, res, next) {
    assert.strictEqual(typeof req.user, 'object');

    debugLog(`get: ${req.params.id}`);

    const [error, result] = await safe(favorites.get(req.params.id));
    if (error) return next(MainError.toHttpError(error));
    if (!result) return next(new HttpError(404, 'favorite does not exist'));
    if (result.userId !== req.user.id) return next(new HttpError(404, 'favorite does not exist'));

    next(new HttpSuccess(200, { favorite: result }));
}

async function remove(req, res, next) {
    assert.strictEqual(typeof req.user, 'object');

    debugLog(`remove: ${req.params.id}`);

    const [getError, favorite] = await safe(favorites.get(req.params.id));
    if (getError) return next(MainError.toHttpError(getError));
    if (!favorite || favorite.userId !== req.user.id) return next(new HttpError(404, 'favorite does not exist'));

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
