import assert from 'assert';
import debug from 'debug';
import activity from '../activity.js';
import MainError from '../mainerror.js';
import files from '../files.js';
import { HttpError, HttpSuccess } from '@cloudron/connect-lastmile';
import safe from '@cloudron/safetydance';

const debugLog = debug('cubby:routes:activity');

async function list(req, res, next) {
    assert.strictEqual(typeof req.user, 'object');

    const filePath = req.query.path;
    if (!filePath) return next(new HttpError(400, 'path must be a non-empty string'));

    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 50;
    if (!Number.isFinite(limit) || limit < 1) return next(new HttpError(400, 'limit must be a positive number'));

    debugLog(`list: ${filePath} limit:${limit}`);

    const subject = await files.translateResourcePath(req.user.username, filePath);
    if (!subject) return next(new HttpError(403, 'not allowed'));

    const [error, items] = await safe(activity.listByPath(subject.usernameOrGroupfolder, subject.filePath, { limit }));
    if (error) return next(MainError.toHttpError(error));

    next(new HttpSuccess(200, { activity: items }));
}

export default {
    list
};
