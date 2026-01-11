'use strict';

exports = module.exports = {
    optionalAttachReceiver,
    attachReceiver,
    getShareLink,
    listShares,
    createShare,
    removeShare
};

const assert = require('assert'),
    debug = require('debug')('cubby:routes:shares'),
    shares = require('../shares.js'),
    files = require('../files.js'),
    path = require('path'),
    MainError = require('../mainerror.js'),
    HttpError = require('connect-lastmile').HttpError,
    HttpSuccess = require('connect-lastmile').HttpSuccess,
    safe = require('safetydance');

function boolLike(arg) {
    if (!arg) return false;
    if (typeof arg === 'number') return !!arg;
    if (typeof arg === 'string' && arg.toLowerCase() === 'false') return false;

    return true;
}

async function optionalAttachReceiver(req, res, next) {
    assert.strictEqual(typeof req.user, 'object');
    assert.strictEqual(typeof req.params.id, 'string');
    assert.strictEqual(typeof req.params.type, 'string');

    if (req.params.type !== 'shares') return next();

    const shareId = req.params.id;

    debug(`optionalAttachReceiver: ${shareId}`);

    const [error, share] = await safe(shares.get(shareId));
    if (error) return next(new HttpError(500, error));
    if (!share) return next(new HttpError(404, 'share not found'));

    req.share = share;

    if (req.user && req.share.receiverUsername && req.share.receiverUsername !== req.user.username) return next(new HttpError(403, 'not allowed'));

    next();
}

async function attachReceiver(req, res, next) {
    assert.strictEqual(typeof req.user, 'object');
    assert.strictEqual(typeof req.params.id, 'string');

    const shareId = req.params.id;

    debug(`attachReceiver: ${shareId}`);

    const [error, share] = await safe(shares.get(shareId));
    if (error) return next(new HttpError(500, error));
    if (!share) return next(new HttpError(404, 'share not found'));

    req.share = share;

    if (req.user && req.share.receiverUsername && req.share.receiverUsername !== req.user.username) return next(new HttpError(403, 'not allowed'));

    next();
}

async function getShareLink(req, res, next) {
    assert.strictEqual(typeof req.share, 'object');

    const filePath = req.query.path || '';//? decodeURIComponent(req.query.path) : '';
    const type = req.query.type;

    if (type && (type !== 'raw' && type !== 'download')) return next(new HttpError(400, 'type must be either empty, "download" or "raw"'));

    debug(`get: ${req.share.id} path:${filePath} type:${type || 'json'}`);

    const [error, file] = await safe(files.get(req.share.ownerUsername ? req.share.ownerUsername : `groupfolder-${req.share.ownerGroupfolder}`, path.join(req.share.filePath, filePath)));
    if (error?.reason === MainError.NOT_FOUND) return next(new HttpError(404, 'file not found'));
    if (error) return next(new HttpError(500, error));

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

    if (receiverEmail || receiverUsername) {
        const [error, existingShares] = await safe(shares.getByOwnerAndReceiverAndFilepath(ownerUsername, ownerGroupfolder, receiverUsername || receiverEmail, filePath, true /* exact match */));
        if (error) return next(new HttpError(500, error));

        if (existingShares && existingShares.length) {
            debug(`create: share already exists. Reusing ${existingShares[0].id}`);
            return next(new HttpSuccess(200, { shareId: existingShares[0].id }));
        }
    }

    const [error, shareId] = await safe(shares.create({ ownerUsername, ownerGroupfolder, filePath, receiverUsername, receiverEmail, readonly, expiresAt }));
    if (error) return next(new HttpError(500, error));

    next(new HttpSuccess(200, { shareId }));
}

async function listShares(req, res, next) {
    assert.strictEqual(typeof req.user, 'object');

    debug('listShares');

    const [error, result] = await safe(shares.list(req.user.username));
    if (error) return next(new HttpError(500, error));

    const validShares = [];
    // Collect all file entries from shares
    for (const share of result) {
        const [error, file] = await safe(files.get(share.ownerUsername ? share.ownerUsername : `groupfolder-${share.ownerGroupfolder}`, share.filePath));
        if (error) debug('listShares: Share does not map to a file or folder', share, error);
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

    const [error] = await safe(shares.remove(shareId));
    if (error) return next(new HttpError(500, error));

    next(new HttpSuccess(200, {}));
}
