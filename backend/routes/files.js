'use strict';

exports = module.exports = {
    add,
    head,
    get,
    update,
    remove,
};

var assert = require('assert'),
    debug = require('debug')('cubby:routes:files'),
    files = require('../files.js'),
    Entry = require('../entry.js'),
    util = require('util'),
    path = require('path'),
    shares = require('../shares.js'),
    MainError = require('../mainerror.js'),
    HttpError = require('connect-lastmile').HttpError,
    HttpSuccess = require('connect-lastmile').HttpSuccess;

function boolLike(arg) {
    if (!arg) return false;
    if (util.isNumber(arg)) return !!arg;
    if (util.isString(arg) && arg.toLowerCase() === 'false') return false;

    return true;
}

async function add(req, res, next) {
    // only allowed for authenticated users until we check for !read-only shares
    if (!req.user) return next(new HttpError(403, 'not allowed'));

    const directory = boolLike(req.query.directory);
    const overwrite = boolLike(req.query.overwrite);
    let filePath = req.query.path ? decodeURIComponent(req.query.path) : '';

    if (!filePath) return next(new HttpError(400, 'path must be a non-empty string'));
    if (!(req.files && req.files.file) && !directory) return next(new HttpError(400, 'missing file or directory'));
    if ((req.files && req.files.file) && directory) return next(new HttpError(400, 'either file or directory'));

    var mtime = req.fields && req.fields.mtime ? new Date(req.fields.mtime) : null;

    let resource = filePath.split('/')[1];
    filePath = filePath.slice(resource.length+1);

    debug(`add: ${resource} ${filePath} ${mtime}`);

    let finalUsername;
    let finalFilePath;
    if (resource === 'home') {
        finalUsername = req.user.username;
        finalFilePath = filePath;
    } else if (resource === 'shares') {
        const shareId = filePath.split('/')[1];
        if (!shareId) return next(new HttpError(500, 'unknown resource'));

        // actual path is without shares/<shareId>/
        const actualFilePath = filePath.split('/').slice(2).join('/');

        const share = await shares.get(shareId);

        finalUsername = share.owner;
        finalFilePath = path.join(share.filePath, actualFilePath);
    } else {
        next(new HttpError(500, `adding to ${resource} not supported`));
    }

    try {
        if (directory) await files.addDirectory(finalUsername, finalFilePath);
        else await files.addOrOverwriteFile(finalUsername, finalFilePath, req.files.file.path, mtime, overwrite);
    } catch (error) {
        if (error.reason === MainError.ALREADY_EXISTS) return next(new HttpError(409, 'already exists'));
        return next(new HttpError(500, error));
    }

    next(new HttpSuccess(200, {}));
}

async function head(req, res, next) {
    // only allowed for authenticated users until we check for !read-only shares
    if (!req.user) return next(new HttpError(403, 'not allowed'));

    const filePath = req.query.path ? decodeURIComponent(req.query.path) : '';

    if (!filePath) return next(new HttpError(400, 'path must be a non-empty string'));

    debug(`head: ${filePath}`);

    let result;

    try {
        result = await files.head(req.user.username, filePath);
    } catch (error) {
        if (error.reason === MainError.NOT_FOUND) return next(new HttpError(404, 'not found'));
        return next(new HttpError(500, error));
    }

    next(new HttpSuccess(200, result));
}

async function get(req, res, next) {
    assert.strictEqual(typeof req.user, 'object');

    const type = req.query.type;
    let filePath;
    try {
        filePath = req.query.path ? decodeURIComponent(req.query.path) : '';
    } catch (e) {
        console.error(e);
    }

    if (!filePath) return next(new HttpError(400, 'path must be a non-empty string'));
    if (type && (type !== 'raw' && type !== 'download' && type !== 'json')) return next(new HttpError(400, 'type must be either empty, "download" or "raw"'));

    const resource = filePath.split('/')[1];
    filePath = filePath.slice(resource.length+1);

    debug(`get: ${resource} ${filePath} type:${type || 'json'}`);

    // only shares may have optional auth
    if (resource !== 'shares' && !req.user) return next(new HttpError(401, 'Unauthorized'));

    if (resource === 'home') {
        let result;
        try {
            result = await files.get(req.user.username, filePath);
        } catch (error) {
            if (error.reason === MainError.NOT_FOUND) return next(new HttpError(404, 'not found'));
            return next(new HttpError(500, error));
        }

        if (type === 'raw') {
            if (result.isDirectory) return next(new HttpError(417, 'type "raw" is not supported for directories'));
            return res.sendFile(result._fullFilePath);
        } else if (type === 'download') {
            if (result.isDirectory) return next(new HttpError(417, 'type "download" is not supported for directories'));
            return res.download(result._fullFilePath);
        }

        next(new HttpSuccess(200, result.withoutPrivate()));
    } else if (resource === 'recent') {
        const daysAgo = isNaN(parseInt(req.query.days_ago, 10)) ? 3 : parseInt(req.query.days_ago, 10);
        const maxFiles = 100;

        debug(`get: recent daysAgo:${daysAgo} maxFiles:${maxFiles}`);

        let result = [];
        try {
            result = await files.recent(req.user.username, daysAgo, maxFiles);
        } catch (error) {
            return next(new HttpError(500, error));
        }

        const entry = new Entry({
            id: 'recent',
            fullFilePath: '/recent',
            fileName: 'Recent',
            filePath: '/',
            owner: req.user.username,
            isDirectory: true,
            isFile: false,
            mimeType: 'inode/recent',
            files: result
        });

        next(new HttpSuccess(200, entry.withoutPrivate()));
    } else if (resource === 'shares') {
        const shareId = filePath.split('/')[1];
        if (shareId) {
            const share = await shares.get(shareId);

            // check if this share is a public link or only for a specific user
            if (req.user && share.receiverUsername && share.receiverUsername !== req.user.username) return next(new HttpError(403, 'not allowed'));

            // actual path is without shares/<shareId>/
            const shareFilePath = filePath.split('/').slice(2).join('/');

            let file;
            try {
                file = await files.get(share.owner, path.join(share.filePath, shareFilePath));
            } catch (error) {
                if (error.reason === MainError.NOT_FOUND) return next(new HttpError(404, 'file not found'));
                return next(new HttpError(500, error));
            }

            if (type === 'raw') {
                if (file.isDirectory) return res.redirect(`/#files/shares/${shareId}/`);
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
        } else {
            debug('listShares');

            // only allowed for authenticated users
            if (!req.user) return next(new HttpError(403, 'not allowed'));

            let result = [];

            try {
                result = await shares.list(req.user.username);
            } catch (error) {
                return next(new HttpError(500, error));
            }

            // Collect all file entries from shares
            let sharedFiles = [];
            try {
                for (let share of result) {
                    let file = await files.get(share.owner, share.filePath);

                    file.isShare = true;
                    file.share = share;
                    file = file.asShare(share.filePath);
                    file.id = share.id;

                    sharedFiles.push(file);
                }
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
                isShare: true,
                owner: req.user.username,
                mimeType: 'inode/share',
                files: sharedFiles
            });

            next(new HttpSuccess(200, entry.withoutPrivate()));
        }
    } else {
        next(new HttpError(500, `Unknown resource type ${resource}`));
    }
}

async function update(req, res, next) {
    // only allowed for authenticated users until we check for !read-only shares
    if (!req.user) return next(new HttpError(403, 'not allowed'));

    const action = req.query.action;
    let filePath = decodeURIComponent(req.query.path);

    if (!filePath) return next(new HttpError(400, 'path must be a non-empty string'));

    let resource = filePath.split('/')[1];
    filePath = filePath.slice(resource.length+1);

    debug(`update: [${action}] ${resource} ${filePath}`);

    // TODO support shares
    if (action === 'move') {
        if (!req.query.new_path) return next(new HttpError(400, 'action requires new_path argument'));

        let newFilePath = decodeURIComponent(req.query.new_path);
        const newResource = newFilePath.split('/')[1];
        newFilePath = newFilePath.slice(newResource.length+1);

        // currently we still operate on username only
        resource = req.user.username;
        try {
            await files.move(resource, filePath, newFilePath);
        } catch (error) {
            if (error.reason === MainError.NOT_FOUND) return next(new HttpError(404, 'not found'));
            if (error.reason === MainError.CONFLICT) return next(new HttpError(409, 'already exists'));
            return next(new HttpError(500, error));
        }
    } else if (action === 'copy') {
        if (!req.query.new_path) return next(new HttpError(400, 'action requires new_path argument'));

        let newFilePath = decodeURIComponent(req.query.new_path);
        const newResource = newFilePath.split('/')[1];
        // currently we still operate on username only
        newFilePath = newFilePath.slice(newResource.length+1);

        // FIXME currently we still operate on username only
        resource = req.user.username;
        try {
            await files.copy(resource, filePath, newFilePath);
        } catch (error) {
            if (error.reason === MainError.NOT_FOUND) return next(new HttpError(404, 'not found'));
            if (error.reason === MainError.CONFLICT) return next(new HttpError(409, 'already exists'));
            return next(new HttpError(500, error));
        }
    } else {
        return next(new HttpError(400, 'unknown action. Must be one of "move", "copy"'));
    }

    return next(new HttpSuccess(200, {}));
}

async function remove(req, res, next) {
    // only allowed for authenticated users until we check for !read-only shares
    if (!req.user) return next(new HttpError(403, 'not allowed'));

    assert.strictEqual(typeof req.user, 'object');

    let filePath = req.query.path ? decodeURIComponent(req.query.path) : '';

    if (!filePath) return next(new HttpError(400, 'path must be a non-empty string'));

    let resource = filePath.split('/')[1];
    filePath = filePath.slice(resource.length+1);

    debug(`remove: ${resource} ${filePath}`);

    // FIXME currently we still operate on username only
    resource = req.user.username;

    try {
        await files.remove(resource, filePath);
    } catch (error) {
        return next(new HttpError(500, error));
    }

    next(new HttpSuccess(200, {}));
}
