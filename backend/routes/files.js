'use strict';

exports = module.exports = {
    translateResourcePath,

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
    groups = require('../groups.js'),
    MainError = require('../mainerror.js'),
    HttpError = require('connect-lastmile').HttpError,
    HttpSuccess = require('connect-lastmile').HttpSuccess;

function boolLike(arg) {
    if (!arg) return false;
    if (util.isNumber(arg)) return !!arg;
    if (util.isString(arg) && arg.toLowerCase() === 'false') return false;

    return true;
}

async function translateResourcePath(user, filePath) {
    const resource = filePath.split('/')[1];
    filePath = filePath.slice(resource.length+1);

    // only shares may have optional auth
    if (resource !== 'shares' && !user) return null;

    if (resource === 'home') {
        return { resource, usernameOrGroup: user.username, filePath };
    } else if (resource === 'shares') {
        const shareId = filePath.split('/')[1];
        if (!shareId) return null;

        const share = await shares.get(shareId);

        // check if this share is a public link or only for a specific user
        if (user && share.receiverUsername && share.receiverUsername !== user.username) return null;

        // actual path is without shares/<shareId>/
        return { resource, usernameOrGroup: share.ownerUsername || share.ownerGroup, filePath: path.join(share.filePath, filePath.split('/').slice(2).join('/')) };
    } else if (resource === 'groups') {
        const groupId = filePath.split('/')[1];
        if (!groupId) return null;

        const group = await groups.get(groupId);

        // check if the user is part of the group
        if (!groups.isPartOf(group, user.username)) return null;

        // actual path is without groups/<groupId>/
        return { resource, usernameOrGroup: `group-${group.id}`, filePath: filePath.split('/').slice(2).join('/') };
    } else {
        return null;
    }
}

async function add(req, res, next) {
    // only allowed for authenticated users until we check for !read-only shares
    if (!req.user) return next(new HttpError(401, 'not allowed'));

    const directory = boolLike(req.query.directory);
    const overwrite = boolLike(req.query.overwrite);
    let filePath = req.query.path || '';

    if (!filePath) return next(new HttpError(400, 'path must be a non-empty string'));
    if (!(req.files && req.files.file) && !directory) return next(new HttpError(400, 'missing file or directory'));
    if ((req.files && req.files.file) && directory) return next(new HttpError(400, 'either file or directory'));

    var mtime = req.fields && req.fields.mtime ? new Date(req.fields.mtime) : null;

    const subject = await translateResourcePath(req.user, filePath);
    if (!subject) return next(new HttpError(403, 'not allowed'));

    debug(`add: ${subject.resource} ${subject.filePath} ${mtime}`);

    try {
        if (directory) await files.addDirectory(subject.usernameOrGroup, subject.filePath);
        else await files.addOrOverwriteFile(subject.usernameOrGroup, subject.filePath, req.files.file.path, mtime, overwrite);
    } catch (error) {
        if (error.reason === MainError.ALREADY_EXISTS) return next(new HttpError(409, 'already exists'));
        return next(new HttpError(500, error));
    }

    next(new HttpSuccess(200, {}));
}

async function head(req, res, next) {
    const filePath = req.query.path;
    if (!filePath) return next(new HttpError(400, 'path must be a non-empty string'));

    const subject = await translateResourcePath(req.user, filePath);
    if (!subject) return next(new HttpError(403, 'not allowed'));

    debug(`head: ${subject.resource} ${subject.filePath}`);

    let result;
    try {
        result = await files.head(subject.usernameOrGroup, subject.filePath);
    } catch (error) {
        if (error.reason === MainError.NOT_FOUND) return next(new HttpError(404, 'not found'));
        return next(new HttpError(500, error));
    }

    next(new HttpSuccess(200, result));
}

async function get(req, res, next) {
    assert.strictEqual(typeof req.user, 'object');

    const type = req.query.type;
    let filePath = req.query.path;

    if (!filePath) return next(new HttpError(400, 'path must be a non-empty string'));
    if (type && (type !== 'raw' && type !== 'download' && type !== 'json')) return next(new HttpError(400, 'type must be either empty, "download" or "raw"'));

    const resource = filePath.split('/')[1];
    if (!resource) return next(new HttpError(400, 'invalid resource'));
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
            if (!share) return next(new HttpError(404, 'no such share'));

            // receiverUsername is set, so this is not a public share
            if (share.receiverUsername && !req.user) return next(new HttpError(403, 'not allowed'));

            // if not a public share the login session has to match
            if (share.receiverUsername && req.user && req.user.username !== share.receiverUsername)  return next(new HttpError(403, 'not allowed'));

            // actual path is without shares/<shareId>/
            const shareFilePath = filePath.split('/').slice(2).join('/');

            let file;
            try {
                file = await files.get(share.ownerUsername || `group-${share.ownerGroup}`, path.join(share.filePath, shareFilePath));
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
            if (!req.user) return next(new HttpError(401, 'not allowed'));

            let result = [];

            try {
                result = await shares.list(req.user.username);
            } catch (error) {
                return next(new HttpError(500, error));
            }

            // Collect all file entries from shares
            let sharedFiles = [];
            for (let share of result) {
                const owner = share.ownerGroup ? `group-${share.ownerGroup}` : share.ownerUsername;

                try {
                    let file = await files.get(owner, share.filePath);

                    file.isShare = true;
                    file.share = share;
                    file = file.asShare(share.filePath);
                    file.id = share.id;

                    sharedFiles.push(file);
                } catch (error) {
                    // TODO maybe delete share from db if file/folder is gone
                    console.error('Failed to list share files.', error);
                }
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
    } else if (resource === 'groups') {
        const groupId = filePath.split('/')[1];
        if (groupId) {
            const group = await groups.get(groupId);
            if (!group) return next(new HttpError(404, 'no such group'));

            if (!groups.isPartOf(group, req.user.username)) return next(new HttpError(403, 'not allowed'));

            // actual path is without groups/<groupId>/
            const groupFilePath = '/' + filePath.split('/').slice(2).join('/');

            let file;
            try {
                file = await files.get(`group-${group.id}`, groupFilePath);
            } catch (error) {
                if (error.reason === MainError.NOT_FOUND) return next(new HttpError(404, 'file not found'));
                return next(new HttpError(500, error));
            }

            if (type === 'raw') {
                if (file.isDirectory) return res.redirect(`/#files/groups/${groupId}/`);
                return res.sendFile(file._fullFilePath);
            } else if (type === 'download') {
                if (file.isDirectory) return next(new HttpError(417, 'type "download" is not supported for directories'));
                return res.download(file._fullFilePath);
            }

            // for now we only allow raw or download on publicly shared links
            // if (!req.user) return next(new HttpError(403, 'not allowed'));

            // those files are always part of this share
            file.files.forEach(function (f) { f.group = group; });
            file.group = group;

            next(new HttpSuccess(200, file.asGroup().withoutPrivate()));
        } else {
            debug('listGroups');

            // only allowed for authenticated users
            if (!req.user) return next(new HttpError(401, 'not allowed'));

            let result = [];

            try {
                result = await groups.list(req.user.username);
            } catch (error) {
                return next(new HttpError(500, error));
            }

            // Collect all file entries from groups
            let memberOfGroups = [];
            try {
                for (let group of result) {
                    let file = await files.get(`group-${group.id}`, '/');

                    file.fileName = group.name;
                    file.isShare = false;
                    file.isGroup = true;
                    file.group = group;
                    file = file.asGroup('/');
                    file.id = group.id;

                    memberOfGroups.push(file);
                }
            } catch (error) {
                return next(new HttpError(500, error));
            }

            const entry = new Entry({
                id: 'groups',
                fullFilePath: '/groups',
                fileName: 'Groups',
                filePath: '/',
                isDirectory: true,
                isFile: false,
                isShare: false,
                isGroup: true,
                owner: req.user.username,
                mimeType: 'inode/share',
                files: memberOfGroups
            });

            next(new HttpSuccess(200, entry.withoutPrivate()));
        }
    } else {
        next(new HttpError(500, `Unknown resource type ${resource}`));
    }
}

async function update(req, res, next) {
    const action = req.query.action;

    const filePath = req.query.path;
    if (!filePath) return next(new HttpError(400, 'path must be a non-empty string'));

    let newFilePath = req.query.new_path;
    if (!newFilePath) return next(new HttpError(400, 'action requires new_path argument'));

    // from
    const subject = await translateResourcePath(req.user, filePath);
    if (!subject) return next(new HttpError(403, 'not allowed'));

    // target - if we support actions without target, this needs to move into the ifs
    const newSubject =  await translateResourcePath(req.user, newFilePath);
    if (!newSubject) return next(new HttpError(403, 'not allowed'));

    debug(`update: [${action}] ${subject.resource} ${subject.usernameOrGroup} ${subject.filePath} -> ${newSubject.resource} ${newSubject.usernameOrGroup} ${newSubject.filePath}`);

    // TODO support shares
    try {
        if (action === 'move') await files.move(subject.usernameOrGroup, subject.filePath, newSubject.usernameOrGroup, newSubject.filePath);
        else if (action === 'copy') await files.copy(subject.usernameOrGroup, subject.filePath, newSubject.usernameOrGroup, newSubject.filePath);
        else return next(new HttpError(400, 'unknown action. Must be one of "move", "copy"'));
    } catch (error) {
        if (error.reason === MainError.NOT_FOUND) return next(new HttpError(404, 'not found'));
        if (error.reason === MainError.CONFLICT) return next(new HttpError(409, 'already exists'));
        return next(new HttpError(500, error));
    }

    return next(new HttpSuccess(200, {}));
}

async function remove(req, res, next) {
    let filePath = req.query.path;
    if (!filePath) return next(new HttpError(400, 'path must be a non-empty string'));

    const subject = await translateResourcePath(req.user, filePath);
    if (!subject) return next(new HttpError(403, 'not allowed'));

    debug(`remove: ${subject.resource} ${subject.usernameOrGroup} ${subject.filePath}`);

    try {
        await files.remove(subject.usernameOrGroup, subject.filePath);
    } catch (error) {
        return next(new HttpError(500, error));
    }

    next(new HttpSuccess(200, {}));
}
