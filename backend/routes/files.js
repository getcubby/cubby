import assert from 'assert';
import debug from 'debug';
import files from '../files.js';
import favorites from '../favorites.js';
import relocate from '../relocate.js';
import Entry from '../entry.js';
import path from 'path';
import recent from '../recent.js';
import shares from '../shares.js';
import groupFolders from '../groupfolders.js';
import MainError from '../mainerror.js';
import safe from '@cloudron/safetydance';
import { HttpError, HttpSuccess } from '@cloudron/connect-lastmile';

const debugLog = debug('cubby:routes:files');

function boolLike(arg) {
    if (!arg) return false;
    if (typeof arg === 'number') return !!arg;
    if (typeof arg === 'string' && arg.toLowerCase() === 'false') return false;

    return true;
}

async function add(req, res, next) {
    const directory = boolLike(req.query.directory);
    const overwrite = boolLike(req.query.overwrite);
    const mtime = req.query.mtime ? new Date(req.query.mtime) : null;
    const filePath = req.query.path || '';

    if (!filePath) return next(new HttpError(400, 'path must be a non-empty string'));

    const subject = await files.translateResourcePath(req.user?.username, filePath);
    if (!subject) return next(new HttpError(403, 'not allowed'));

    if (subject.share?.readonly) return next(new HttpError(403, 'share is read-only'));
    if (!subject.share && !req.user) return next(new HttpError(401, 'not allowed'));

    debugLog(`add: ${subject.resource} ${subject.filePath} ${mtime}`);

    const actor = req.user?.username;
    let error;
    if (directory) {
        [error] = await safe(files.addDirectory(subject.usernameOrGroupfolder, subject.filePath, { actor }));
    } else {
        [error] = await safe(files.addOrOverwriteFile(subject.usernameOrGroupfolder, subject.filePath, req, mtime, overwrite, { actor }));
        if (!error && req.user) await recent.add(req.user.username, subject.resourcePath);
    }
    if (error) return next(MainError.toHttpError(error));

    next(new HttpSuccess(200, {}));
}

async function head(req, res, next) {
    const filePath = req.query.path;
    if (!filePath) return next(new HttpError(400, 'path must be a non-empty string'));

    const subject = await files.translateResourcePath(req.user?.username, filePath);
    if (!subject) return next(new HttpError(403, 'not allowed'));
    if (!subject.share && !req.user) return next(new HttpError(401, 'not allowed'));

    debugLog(`head: ${subject.resource} ${subject.filePath}`);

    const [error, result] = await safe(files.head(subject.usernameOrGroupfolder, subject.filePath));
    if (error) return next(MainError.toHttpError(error));

    next(new HttpSuccess(200, result));
}

// wrapper to handle json content type
function sendFile(res, file) {
    // special treatment for json, so the clients do not parse it as json api response!
    const headers = {};
    if (file.mimeType === 'application/json') headers['content-type'] = 'text/plain';

    res.sendFile(file._fullFilePath, { headers, dotfiles: 'allow' });
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

    debugLog(`get: ${resource} ${filePath} type:${type || 'json'}`);

    // only shares may have optional auth
    if (resource !== 'shares' && !req.user) return next(new HttpError(401, 'Unauthorized'));

    if (resource === 'home') {
        const [error, result] = await safe(files.get(req.user.username, filePath));
        if (error) return next(MainError.toHttpError(error));

        if (type === 'raw') {
            if (result.isDirectory) return next(new HttpError(417, 'type "raw" is not supported for directories'));

            if (req.user) await recent.add(req.user.username, req.query.path);

            return sendFile(res, result);
        } else if (type === 'download') {
            if (result.isDirectory) return next(new HttpError(417, 'type "download" is not supported for directories'));
            return res.download(result._fullFilePath, { dotfiles: 'allow' });
        }

        next(new HttpSuccess(200, result.withoutPrivate(req.user.username)));
    } else if (resource === 'shares') {
        const shareId = filePath.split('/')[1];
        if (shareId) {
            const share = await shares.get(shareId);
            if (!share) return next(new HttpError(404, 'no such share'));

            if (shares.isExpired(share)) return next(new HttpError(404, 'no such share'));

            // receiverUsername is set, so this is not a public share
            if (share.receiverUsername && !req.user) return next(new HttpError(403, 'not allowed'));

            // if not a public share the login session has to match
            if (share.receiverUsername && req.user && req.user.username !== share.receiverUsername)  return next(new HttpError(403, 'not allowed'));

            // actual path is without shares/<shareId>/
            const shareFilePath = filePath.split('/').slice(2).join('/');

            const [error, file] = await safe(files.get(share.ownerUsername || `groupfolder-${share.ownerGroupfolder}`, path.join(share.filePath, shareFilePath)));
            if (error) return next(MainError.toHttpError(error));

            if (type === 'raw') {
                if (file.isDirectory) return res.redirect(301, `/#files/shares/${shareId}/`);

                if (req.user) await recent.add(req.user.username, req.query.path);

                return sendFile(res, file);
            } else if (type === 'download') {
                if (file.isDirectory) return next(new HttpError(417, 'type "download" is not supported for directories'));
                return res.download(file._fullFilePath, { dotfiles: 'allow' });
            }

            // for now we only allow raw or download on publicly shared links
            // if (!req.user) return next(new HttpError(403, 'not allowed'));

            // those files are always part of this share
            file.files.forEach(function (f) { f.share = share; });
            file.share = share;
            let shareFile = file.asShare(share.filePath);
            await favorites.attachToShareTree(shareFile, shareId);

            next(new HttpSuccess(200, shareFile.withoutPrivate(req.user ? req.user.username : null)));
        } else {
            debugLog('listShares');

            // only allowed for authenticated users
            if (!req.user) return next(new HttpError(401, 'not allowed'));

            const [listError, result] = await safe(shares.listSharedWith(req.user.username));
            if (listError) return next(MainError.toHttpError(listError));

            // Collect all file entries from shares
            const sharedFiles = [];
            for (const share of result) {
                const owner = share.ownerGroupfolder ? `groupfolder-${share.ownerGroupfolder}` : share.ownerUsername;

                const [getError, file] = await safe(files.get(owner, share.filePath));
                if (getError) {
                    // TODO maybe delete share from db if file/folder is gone
                    console.error('Failed to list share files.', getError);
                    continue;
                }

                file.isShare = true;
                file.share = share;
                let shareEntry = file.asShare(share.filePath);
                shareEntry.id = share.id;

                sharedFiles.push(shareEntry);
            }

            const entry = new Entry({
                id: 'shares',
                fullFilePath: '/shares',
                fileName: 'Shares',
                filePath: '/',
                isDirectory: true,
                isFile: false,
                isShare: true,
                favorites: [],
                owner: req.user.username,
                mimeType: 'inode/share',
                files: sharedFiles
            });

            next(new HttpSuccess(200, entry.withoutPrivate(req.user.username)));
        }
    } else if (resource === 'groupfolders') {
        const groupFolderId = filePath.split('/')[1];
        if (groupFolderId) {
            const group = await groupFolders.get(groupFolderId);
            if (!group) return next(new HttpError(404, 'no such groupfolder'));

            if (!groupFolders.isPartOf(group, req.user.username)) return next(new HttpError(403, 'not allowed'));

            // actual path is without groupfolder/<groupId>/
            const groupFilePath = '/' + filePath.split('/').slice(2).join('/');

            const [error, file] = await safe(files.get(`groupfolder-${group.id}`, groupFilePath));
            if (error) return next(MainError.toHttpError(error));

            if (type === 'raw') {
                if (file.isDirectory) return res.redirect(301, `/#files/groupfolders/${groupFolderId}/`);

                if (req.user) await recent.add(req.user.username, req.query.path);

                return sendFile(res, file);
            } else if (type === 'download') {
                if (file.isDirectory) return next(new HttpError(417, 'type "download" is not supported for directories'));
                return res.download(file._fullFilePath, { dotfiles: 'allow' });
            }

            next(new HttpSuccess(200, file.asGroup().withoutPrivate(req.user.username)));
        } else {
            debugLog('listGroupFolders');

            // only allowed for authenticated users
            if (!req.user) return next(new HttpError(401, 'not allowed'));

            const [listError, result] = await safe(groupFolders.list(req.user.username));
            if (listError) return next(MainError.toHttpError(listError));

            // Collect all file entries from groupfolder
            const memberOfGroups = [];
            for (const group of result) {
                const [getError, file] = await safe(files.get(`groupfolder-${group.id}`, '/'));
                if (getError) return next(MainError.toHttpError(getError));

                file.fileName = group.name;
                file.isShare = false;
                file.isGroup = true;
                let groupEntry = file.asGroup('/');
                groupEntry.id = group.id;

                memberOfGroups.push(groupEntry);
            }

            const entry = new Entry({
                id: 'groupfolders',
                fullFilePath: '/groupfolders',
                fileName: 'Group folders',
                filePath: '/',
                favorites: [],
                isDirectory: true,
                isFile: false,
                isShare: false,
                isGroup: true,
                size: 0, // toplevel groupfolder has no size
                owner: req.user.username,
                mimeType: 'inode/share',
                files: memberOfGroups
            });

            next(new HttpSuccess(200, entry.withoutPrivate(req.user.username)));
        }
    } else {
        next(new HttpError(500, `Unknown resource type ${resource}`));
    }
}

async function update(req, res, next) {
    const action = req.query.action;

    const filePath = req.query.path;
    if (!filePath) return next(new HttpError(400, 'path must be a non-empty string'));

    const newFilePath = req.query.new_path;
    if (!newFilePath) return next(new HttpError(400, 'action requires new_path argument'));

    // from
    const subject = await files.translateResourcePath(req.user?.username, filePath);
    if (!subject) return next(new HttpError(403, 'not allowed'));

    // target - if we support actions without target, this needs to move into the ifs
    const newSubject =  await files.translateResourcePath(req.user?.username, newFilePath);
    if (!newSubject) return next(new HttpError(403, 'not allowed'));

    if (subject.share?.readonly || newSubject.share?.readonly) return next(new HttpError(403, 'share is read-only'));
    if (!subject.share && !newSubject.share && !req.user) return next(new HttpError(401, 'not allowed'));

    debugLog(`update: [${action}] ${subject.resource} ${subject.usernameOrGroupfolder} ${subject.filePath} -> ${newSubject.resource} ${newSubject.usernameOrGroupfolder} ${newSubject.filePath}`);

    let error;
    if (action === 'move') {
        [error] = await safe(relocate.relocate({
            actor: req.user?.username,
            fromOwner: subject.usernameOrGroupfolder,
            fromPath: subject.filePath,
            toOwner: newSubject.usernameOrGroupfolder,
            toPath: newSubject.filePath
        }));
    } else if (action === 'copy') {
        [error] = await safe(files.copy(subject.usernameOrGroupfolder, subject.filePath, newSubject.usernameOrGroupfolder, newSubject.filePath, false, { actor: req.user?.username }));
    } else if (action === 'extract') {
        [error] = await safe(files.extract(subject.usernameOrGroupfolder, subject.filePath, newSubject.usernameOrGroupfolder, newSubject.filePath));
    } else {
        return next(new HttpError(400, 'unknown action. Must be one of "move", "copy"'));
    }
    if (error) return next(MainError.toHttpError(error));

    return next(new HttpSuccess(200, {}));
}

async function remove(req, res, next) {
    const filePath = req.query.path;
    if (!filePath) return next(new HttpError(400, 'path must be a non-empty string'));

    const subject = await files.translateResourcePath(req.user?.username, filePath);
    if (!subject) return next(new HttpError(403, 'not allowed'));

    if (subject.share?.readonly) return next(new HttpError(403, 'share is read-only'));
    if (!subject.share && !req.user) return next(new HttpError(401, 'not allowed'));

    debugLog(`remove: ${subject.resource} ${subject.usernameOrGroupfolder} ${subject.filePath}`);

    const [error] = await safe(files.remove(subject.usernameOrGroupfolder, subject.filePath, { actor: req.user?.username }));
    if (error) return next(MainError.toHttpError(error));

    if (req.user) await recent.remove(req.user.username, subject.resourcePath);

    next(new HttpSuccess(200, {}));
}

export default {
    add,
    head,
    get,
    update,
    remove,
};
