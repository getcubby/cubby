'use strict';

exports = module.exports = {
    optionalAttachReceiver,
    attachReceiver,
    getShareLink,
    listShares,
    createShare,
    removeShare
};

var assert = require('assert'),
    debug = require('debug')('cubby:routes:shares'),
    shares = require('../shares.js'),
    files = require('../files.js'),
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

async function optionalAttachReceiver(req, res, next) {
    assert.strictEqual(typeof req.user, 'object');
    assert.strictEqual(typeof req.params.id, 'string');
    assert.strictEqual(typeof req.params.type, 'string');

    if (req.params.type !== 'shares') return next();

    const shareId = req.params.id;

    debug(`optionalAttachReceiver: ${shareId}`);

    try {
        req.share = await shares.get(shareId);
    } catch (error) {
        if (error.reason === MainError.NOT_FOUND) return next(new HttpError(404, 'share not found'));
        return next(new HttpError(500, error));
    }

    if (req.user && req.share.receiverUsername && req.share.receiverUsername !== req.user.username) return next(new HttpError(403, 'not allowed'));

    next();
}

async function attachReceiver(req, res, next) {
    assert.strictEqual(typeof req.user, 'object');
    assert.strictEqual(typeof req.params.id, 'string');

    const shareId = req.params.id;

    debug(`attachReceiver: ${shareId}`);

    try {
        req.share = await shares.get(shareId);
    } catch (error) {
        if (error.reason === MainError.NOT_FOUND) return next(new HttpError(404, 'share not found'));
        return next(new HttpError(500, error));
    }

    if (req.user && req.share.receiverUsername && req.share.receiverUsername !== req.user.username) return next(new HttpError(403, 'not allowed'));

    next();
}

async function getShareLink(req, res, next) {
    assert.strictEqual(typeof req.share, 'object');

    const filePath = req.query.path || '';//? decodeURIComponent(req.query.path) : '';
    const type = req.query.type;

    if (type && (type !== 'raw' && type !== 'download')) return next(new HttpError(400, 'type must be either empty, "download" or "raw"'));

    debug(`get: ${req.share.id} path:${filePath} type:${type || 'json'}`);

    let file;
    try {
        file = await files.get(req.share.ownerUsername ? req.share.ownerUsername : `groupfolder-${req.share.ownerGroupfolder}`, path.join(req.share.filePath, filePath));
    } catch (error) {
        if (error.reason === MainError.NOT_FOUND) return next(new HttpError(404, 'file not found'));
        return next(new HttpError(500, error));
    }

    if (type === 'raw') {
        if (file.isDirectory) return res.redirect(301, `/#files/shares/${req.share.id}/`);
        res.set('Content-Disposition', `inline; filename="${file.fileName}"`);
        res.sendFile(file._fullFilePath, { dotfiles: 'allow' });
        return;
    } else if (type === 'download') {
        if (file.isDirectory) return next(new HttpError(417, 'type "download" is not supported for directories'));
        return res.download(file._fullFilePath, { dotfiles: 'allow' });
    }

    // for now we only allow raw or download on publicly shared links
    // if (!req.user) return next(new HttpError(403, 'not allowed'));

    // those files are always part of this share
    file.files.forEach(function (f) { f.share = req.share; });
    file.share = req.share;

    next(new HttpSuccess(200, file.asShare(req.share.filePath).withoutPrivate(null)));
}

// If a share for the receiver and filepath already exists, just reuse that
async function createShare(req, res, next) {
    assert.strictEqual(typeof req.user, 'object');

    if (!req.body.path) return next(new HttpError(400, 'path must be a non-empty string'));

    const ownerUsername = req.body.ownerUsername || null;
    const ownerGroupfolder = req.body.ownerGroupfolder || null;
    const filePath = req.body.path.replace(/\/+/g, '/');
    const receiverUsername = req.body.receiverUsername || null;
    const receiverEmail = req.body.receiverEmail || null;
    const readonly = boolLike(req.body.readonly);
    const expiresAt = req.body.expiresAt ? parseInt(req.body.expiresAt) : 0;

    debug(`createShare: ${filePath} receiver:${receiverUsername || receiverEmail || 'link'}`);

    let existingShares;

    if (receiverEmail || receiverUsername) {
        try {
            existingShares = await shares.getByOwnerAndReceiverAndFilepath(ownerUsername, ownerGroupfolder, receiverUsername || receiverEmail, filePath, true /* exact match */);
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
        shareId = await shares.create({ ownerUsername, ownerGroupfolder, filePath, receiverUsername, receiverEmail, readonly, expiresAt });
    } catch (error) {
        return next(new HttpError(500, error));
    }

    next(new HttpSuccess(200, { shareId }));
}

async function listShares(req, res, next) {
    assert.strictEqual(typeof req.user, 'object');

    debug('listShares');

    let result = [];

    try {
        result = await shares.list(req.user.username);
    } catch (error) {
        return next(new HttpError(500, error));
    }

    const validShares = [];
    // Collect all file entries from shares
    for (const share of result) {
        let file;
        try {
            file = await files.get(share.ownerUsername ? share.ownerUsername : `groupfolder-${share.ownerGroupfolder}`, share.filePath);
        } catch (error) {
            console.error('Share does not map to a file or folder', share, error);
        }

        if (!file) continue;

        share.file = file.withoutPrivate(req.user.username);
        validShares.push(share);
    }

    next(new HttpSuccess(200, { shares: validShares }));
}

async function removeShare(req, res, next) {
    assert.strictEqual(typeof req.user, 'object');

    const shareId = req.query.shareId;

    if (!shareId) return next(new HttpError(400, 'share_id must be a non-empty string'));

    debug(`removeShare: ${shareId}`);

    try {
        await shares.remove(shareId);
    } catch (error) {
        return next(new HttpError(500, error));
    }

    next(new HttpSuccess(200, {}));
}
