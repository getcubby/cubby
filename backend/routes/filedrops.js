import assert from 'assert';
import debug from 'debug';
import filedrops from '../filedrops.js';
import files from '../files.js';
import activity from '../activity.js';
import path from 'path';
import MainError from '../mainerror.js';
import { HttpError, HttpSuccess } from '@cloudron/connect-lastmile';
import safe from '@cloudron/safetydance';

const debugLog = debug('cubby:routes:filedrops');

function parseExpiresAtMs(raw) {
    if (raw === undefined || raw === null || raw === 0) return { expiresAtMs: null };

    if (typeof raw !== 'number' || !Number.isFinite(raw)) return { error: 'expiresAt must be a finite number (milliseconds) or omitted' };

    if (raw < 0) return { error: 'expiresAt must be non-negative' };

    const now = Date.now();
    if (raw <= now) return { error: 'expiresAt must be in the future' };

    const max = now + 10 * 365 * 24 * 60 * 60 * 1000;
    if (raw > max) return { error: 'expiresAt is too far in the future' };

    return { expiresAtMs: raw };
}

async function createFiledrop(req, res, next) {
    assert.strictEqual(typeof req.user, 'object');

    if (!req.body.path) return next(new HttpError(400, 'path must be a non-empty string'));

    const ownerUsername = req.body.ownerUsername || null;
    const ownerGroupfolder = req.body.ownerGroupfolder || null;
    const filePath = req.body.path.replace(/\/+/g, '/');
    const parsed = parseExpiresAtMs(req.body.expiresAt);
    if (parsed.error) return next(new HttpError(400, parsed.error));
    const expiresAt = parsed.expiresAtMs;

    debugLog(`createFiledrop: ${filePath}`);

    const [error, filedropId] = await safe(filedrops.create({ ownerUsername, ownerGroupfolder, filePath, expiresAt }));
    if (error) return next(MainError.toHttpError(error));

    const owner = ownerUsername || `groupfolder-${ownerGroupfolder}`;
    await activity.log({ actor: req.user.username, owner, filePath, action: 'filedrop_created', details: { filedropId } });

    next(new HttpSuccess(200, { filedropId }));
}

async function listFiledrops(req, res, next) {
    assert.strictEqual(typeof req.user, 'object');

    debugLog('listFiledrops');

    const [error, result] = await safe(filedrops.list(req.user.username));
    if (error) return next(MainError.toHttpError(error));

    next(new HttpSuccess(200, { filedrops: result }));
}

async function removeFiledrop(req, res, next) {
    assert.strictEqual(typeof req.user, 'object');

    const filedropId = req.query.filedropId;

    if (!filedropId) return next(new HttpError(400, 'filedropId must be a non-empty string'));

    debugLog(`removeFiledrop: ${filedropId}`);

    const [getError, filedrop] = await safe(filedrops.get(filedropId));
    if (getError) return next(new HttpError(500, getError));
    if (!filedrop) return next(new HttpError(404, 'not found'));

    const [error] = await safe(filedrops.remove(filedropId));
    if (error) return next(MainError.toHttpError(error));

    const owner = filedrop.ownerUsername || `groupfolder-${filedrop.ownerGroupfolder}`;
    await activity.log({ actor: req.user.username, owner, filePath: filedrop.filePath, action: 'filedrop_deleted', details: { filedropId } });

    next(new HttpSuccess(200, {}));
}

async function getFiledropInfo(req, res, next) {
    assert.strictEqual(typeof req.params.id, 'string');

    const filedropId = req.params.id;

    debugLog(`getFiledropInfo: ${filedropId}`);

    const [error, filedrop] = await safe(filedrops.get(filedropId));
    if (error) return next(MainError.toHttpError(error));
    if (!filedrop) return next(new HttpError(404, 'not found'));

    if (filedrops.isExpired(filedrop)) return next(new HttpError(404, 'not found'));

    const owner = filedrop.ownerUsername || `groupfolder-${filedrop.ownerGroupfolder}`;

    const [fileError, targetFolder] = await safe(files.head(owner, filedrop.filePath));
    if (fileError) return next(MainError.toHttpError(fileError));

    next(new HttpSuccess(200, {
        id: filedrop.id,
        folderName: targetFolder.fileName,
        createdAt: filedrop.createdAt,
        expiresAt: filedrop.expiresAt
    }));
}

async function uploadToFiledrop(req, res, next) {
    assert.strictEqual(typeof req.params.id, 'string');

    const filedropId = req.params.id;
    const fileName = req.query.name;

    if (!fileName || typeof fileName !== 'string') return next(new HttpError(400, 'name must be a non-empty string'));

    debugLog(`uploadToFiledrop: ${filedropId} name:${fileName}`);

    const [getError, filedrop] = await safe(filedrops.get(filedropId));
    if (getError) return next(MainError.toHttpError(getError));
    if (!filedrop) return next(new HttpError(404, 'not found'));

    if (filedrops.isExpired(filedrop)) return next(new HttpError(404, 'not found'));

    const owner = filedrop.ownerUsername || `groupfolder-${filedrop.ownerGroupfolder}`;

    let uploadFilePath = path.join(filedrop.filePath, fileName);
    let counter = 1;

    while (true) {
        const [existsError, existing] = await safe(files.head(owner, uploadFilePath));
        if (existsError) {
            if (existsError.reason === MainError.NOT_FOUND) break;
            return next(MainError.toHttpError(existsError));
        }
        if (!existing) break;

        const ext = path.extname(fileName);
        const base = path.basename(fileName, ext);
        uploadFilePath = path.join(filedrop.filePath, `${base}-${counter}${ext}`);
        counter++;
    }

    const mtime = new Date();

    const [uploadError] = await safe(files.addOrOverwriteFile(owner, uploadFilePath, req, mtime, false, {}));
    if (uploadError) {
        if (uploadError.reason === MainError.ALREADY_EXISTS) return next(new HttpError(409, 'file already exists'));
        return next(MainError.toHttpError(uploadError));
    }

    const displayName = uploadFilePath.replace(filedrop.filePath + '/', '');

    next(new HttpSuccess(200, { fileName: displayName }));
}

export default {
    createFiledrop,
    listFiledrops,
    removeFiledrop,
    getFiledropInfo,
    uploadToFiledrop
};
