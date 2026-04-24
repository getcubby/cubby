import assert from 'assert';
import debug from 'debug';
import favorites from '../favorites.js';
import files from '../files.js';
import { HttpError, HttpSuccess } from '@cloudron/connect-lastmile';
import safe from '@cloudron/safetydance';

const debugLog = debug('cubby:routes:favorites');

async function create(req, res, next) {
    assert.strictEqual(typeof req.user, 'object');

    if (!req.body.path) return next(new HttpError(400, 'path must be a non-empty string'));

    const filePath = req.body.path.replace(/\/+/g, '/');
    const owner = req.body.owner || req.user.username; // user can favorite a filePath owned by another (when shared)

    debugLog(`create: owner:${owner} ${filePath}`);

    const [error, id] = await safe(favorites.create(req.user.username, owner, filePath));
    if (error) return next(new HttpError(500, error));

    next(new HttpSuccess(200, { id }));
}

async function list(req, res, next) {
    assert.strictEqual(typeof req.user, 'object');

    debugLog(`list: for ${req.user.username}`);

    const [error, result] = await safe(favorites.list(req.user.username));
    if (error) return next(new HttpError(500, error));

    const validFavorites = [];
    // Collect all file entries from favorites
    for (const favorite of result) {
        const [error, file] = await safe(files.get(favorite.owner, favorite.filePath));
        if (error) debugLog('Favorite does not map to a file or folder', favorite, error);
        if (!file) continue;

        validFavorites.push(file.withoutPrivate(req.user.username));
    }

    next(new HttpSuccess(200, { favorites: validFavorites }));
}

async function get(req, res, next) {
    assert.strictEqual(typeof req.user, 'object');

    debugLog(`get: ${req.params.id}`);

    const [error, result] = await safe(favorites.get(req.params.id));
    if (error) return next(new HttpError(500, error));
    if (!result) return next(new HttpError(404, 'favorite does not exist'));

    const [fileError, file] = await safe(files.get(result.owner, result.filePath));
    if (fileError) debugLog('Favorite does not map to a file or folder', result, fileError);
    if (!file) return next(new HttpError(409, 'favorite does not map to a file'));

    next(new HttpSuccess(200, {}));
}

async function remove(req, res, next) {
    assert.strictEqual(typeof req.user, 'object');

    debugLog(`remove: ${req.params.id}`);

    const [error] = await safe(favorites.remove(req.params.id));
    if (error) return next(new HttpError(500, error));

    next(new HttpSuccess(200, {}));
}

export default {
    create,
    list,
    get,
    remove
};
