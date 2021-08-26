'use strict';

exports = module.exports = {
    list,
    add,
    get,
    head,
    create,
    remove
};

var assert = require('assert'),
    async = require('async'),
    debug = require('debug')('cubby:routes:shares'),
    shares = require('../shares.js'),
    files = require('../files.js'),
    Entry = require('../entry.js'),
    util = require('util'),
    path = require('path'),
    MainError = require('../mainerror.js'),
    HttpError = require('connect-lastmile').HttpError,
    HttpSuccess = require('connect-lastmile').HttpSuccess;

function boolLike(arg) {
    if (!arg) return false;
    if (util.isNumber(arg)) return !!arg;
    if (util.isString(arg) && arg.toLowerCase() === 'false') return false;

    return true;
}

async function list(req, res, next) {
    assert.strictEqual(typeof req.user, 'object');

    debug('get');

    let result = [];

    try {
        result = await shares.list(req.user.username);
    } catch (error) {
        return next(new HttpError(500, error));
    }

    // Collect all file entries from shares
    let sharedFiles = [];
    try {
        await async.each(result, async function (share) {
            let file = await files.get(share.owner, share.filePath);

            file.share = share;
            file = file.asShare(share.filePath);

            sharedFiles.push(file);
        });
    } catch (error) {
        return next(new HttpError(500, error));
    }

    const entry = new Entry({
        id: 'shares',
        fullFilePath: '/shares',
        fileName: 'Shares',
        filePath: '/',
        isDirectory: true,
        isFile: false,
        owner: req.user.username,
        mimeType: 'inode/share',
        files: sharedFiles
    });

    next(new HttpSuccess(200, entry.withoutPrivate()));
}

async function add(req, res, next) {
    assert.strictEqual(typeof req.params.shareId, 'string');

    const filePath = req.query.path || '';
    const shareId = req.params.shareId;
    const directory = boolLike(req.query.directory);
    const overwrite = boolLike(req.query.overwrite);

    if (!filePath) return next(new HttpError(400, 'path must be a non-empty string'));
    if (!(req.files && req.files.file) && !directory) return next(new HttpError(400, 'missing file or directory'));
    if ((req.files && req.files.file) && directory) return next(new HttpError(400, 'either file or directory'));

    const mtime = req.fields && req.fields.mtime ? new Date(req.fields.mtime) : null;

    debug(`add: ${shareId} path:${filePath} mtime:${mtime}`);

    let share;
    try {
        share = await shares.get(shareId);
    } catch (error) {
        if (error.reason === MainError.NOT_FOUND) return next(new HttpError(404, 'share not found'));
        return next(new HttpError(500, error));
    }

    if (req.user && share.receiverUsername && share.receiverUsername !== req.user.username) return next(new HttpError(403, 'not allowed'));

    try {
        if (directory) await files.addDirectory(share.owner, path.join(share.filePath, filePath));
        else await files.addOrOverwriteFile(share.owner, path.join(share.filePath, filePath), req.files.file.path, mtime, overwrite);
    } catch (error) {
        if (error.reason === MainError.ALREADY_EXISTS) return next(new HttpError(409, 'already exists'));
        return next(new HttpError(500, error));
    }

    next(new HttpSuccess(200, {}));
}

async function get(req, res, next) {
    assert.strictEqual(typeof req.params.shareId, 'string');

    const filePath = req.query.path || '';//? decodeURIComponent(req.query.path) : '';
    const type = req.query.type;
    const shareId = req.params.shareId;

    if (type && (type !== 'raw' && type !== 'download')) return next(new HttpError(400, 'type must be either empty, "download" or "raw"'));

    debug(`get: ${shareId} path:${filePath} type:${type || 'json'}`);

    let share;
    try {
        share = await shares.get(shareId);
    } catch (error) {
        if (error.reason === MainError.NOT_FOUND) return next(new HttpError(404, 'share not found'));
        return next(new HttpError(500, error));
    }

    if (req.user && share.receiverUsername && share.receiverUsername !== req.user.username) return next(new HttpError(403, 'not allowed'));

    let file;
    try {
        file = await files.get(share.owner, path.join(share.filePath, filePath));
    } catch (error) {
        if (error.reason === MainError.NOT_FOUND) return next(new HttpError(404, 'file not found'));
        return next(new HttpError(500, error));
    }

    if (type === 'raw') {
        if (file.isDirectory) return res.redirect(`/share.html?shareId=${shareId}#/`);
        return res.sendFile(file._fullFilePath);
    } else if (type === 'download') {
        if (file.isDirectory) return next(new HttpError(417, 'type "download" is not supported for directories'));
        return res.download(file._fullFilePath);
    }

    // for now we only allow raw or download on publicly shared links
    // if (!req.user) return next(new HttpError(403, 'not allowed'));

    // those files are always part of this share
    file.files.forEach(function (f) { f.share = share; });
    file.share = share;

    next(new HttpSuccess(200, file.asShare(share.filePath).withoutPrivate()));
}

async function head(req, res, next) {
    assert.strictEqual(typeof req.params.shareId, 'string');

    const filePath = req.query.path || '';//? decodeURIComponent(req.query.path) : '';
    const type = req.query.type;
    const shareId = req.params.shareId;

    if (type && (type !== 'raw' && type !== 'download')) return next(new HttpError(400, 'type must be either empty, "download" or "raw"'));

    debug(`head: ${shareId} path:${filePath} type:${type || 'json'}`);

    let share;
    try {
        share = await shares.get(shareId);
    } catch (error) {
        if (error.reason === MainError.NOT_FOUND) return next(new HttpError(404, 'share not found'));
        return next(new HttpError(500, error));
    }

    if (req.user && share.receiverUsername && share.receiverUsername !== req.user.username) return next(new HttpError(403, 'not allowed'));

    let result;
    try {
        result = await files.head(share.owner, path.join(share.filePath, filePath));
    } catch (error) {
        if (error.reason === MainError.NOT_FOUND) return next(new HttpError(404, 'file not found'));
        return next(new HttpError(500, error));
    }


    next(new HttpSuccess(200, result));
}

// If a share for the receiver and filepath already exists, just reuse that
async function create(req, res, next) {
    assert.strictEqual(typeof req.user, 'object');

    const filePath = decodeURIComponent(req.query.path);
    const receiverUsername = req.query.receiver_username || null;
    const receiverEmail = req.query.receiver_email || null;
    const readonly = boolLike(req.query.readonly);
    const expiresAt = req.query.expires_at ? parseInt(req.query.expires_at) : 0;

    if (!filePath) return next(new HttpError(400, 'path must be a non-empty string'));

    debug(`create: ${filePath} receiver:${receiverUsername || receiverEmail || 'link'}`);

    let existingShares;

    if (receiverEmail || receiverUsername) {
        try {
            existingShares = await shares.getByReceiverAndFilepath(receiverUsername || receiverEmail, filePath, true /* exact match */);
        } catch (error) {
            return next(new HttpError(500, error));
        }

        if (existingShares && existingShares.length) {
            debug(`create: share already exists. Reusing ${existingShares[0].id}`);
            return next(new HttpSuccess(200, { shareId: existingShares[0].id }));
        }
    }

    let shareId;
    try {
        shareId = await shares.create({ user: req.user, filePath, receiverUsername, receiverEmail, readonly, expiresAt });
    } catch (error) {
        return next(new HttpError(500, error));
    }

    next(new HttpSuccess(200, { shareId }));
}

async function remove(req, res, next) {
    assert.strictEqual(typeof req.user, 'object');

    debug(`remove: ${req.params.shareId}`);

    try {
        await shares.remove(req.params.shareId);
    } catch (error) {
        return next(new HttpError(500, error));
    }

    next(new HttpSuccess(200, {}));
}
