'use strict';

exports = module.exports = {
    getConfig,
    getPreview,
    download,
    recent,
    search
};

const assert = require('assert'),
    archiver = require('archiver'),
    config = require('../config.js'),
    debug = require('debug')('cubby:routes:misc'),
    Entry = require('../entry.js'),
    files = require('../files.js'),
    groupFolders = require('../groupfolders.js'),
    MainError = require('../mainerror.js'),
    office = require('../office.js'),
    path = require('path'),
    preview = require('../preview.js'),
    recoll = require('../recoll.js'),
    safe = require('safetydance'),
    shares = require('../shares.js'),
    HttpError = require('connect-lastmile').HttpError,
    HttpSuccess = require('connect-lastmile').HttpSuccess;

async function getConfig(req, res, next) {
    // currently we only send configs for collabora

    const tmp = {
        viewers: {}
    };

    const collaboraHost = config.get('collabora.host', '');
    if (collaboraHost) {
        const [error, extensions] = await safe(office.getSupportedExtensions(collaboraHost));
        if (error) console.error('Failed to get collabora config. Disabling office viewer.', error);
        else tmp.viewers.collabora = { extensions };
    }

    next(new HttpSuccess(200, tmp));
}

async function getPreview(req, res, next) {
    assert.strictEqual(typeof req.user, 'object');

    const type = req.params.type;
    const id = req.params.id; // id depends on type (either username or shareId)
    const hash = req.params.hash;

    debug(`getPreview: type=${type} id=${id} hash=${hash}`);

    if (type === 'files') {
        if (!req.user || id !== req.user.username) return next(new HttpError(404, 'not found')); // do not leak if username or hash should exist

        const localPreviewPath = preview.getLocalPath(hash);
        if (localPreviewPath) return res.sendFile(localPreviewPath);

        return next(new HttpError(412, 'try again later'));
    } else if (type === 'shares') {
        // permissions are checked in routes/shares.js
        if (!req.share) return next(new HttpError(404, 'not found'));

        const localPreviewPath = preview.getLocalPath(hash);
        if (localPreviewPath) return res.sendFile(localPreviewPath);

        return next(new HttpError(412, 'try again later'));
    } else if (type === 'groups') {
        // TODO check permissions if user has access to this group

        const localPreviewPath = preview.getLocalPath(hash);
        if (localPreviewPath) return res.sendFile(localPreviewPath);

        return next(new HttpError(412, 'try again later'));
    }

    next(new HttpError(404, 'not found'));
}

async function download(req, res, next) {
    assert.strictEqual(typeof req.user, 'object');

    const entries = req.query.entries.split(',');
    const skipPath = req.query.skipPath || '';
    const name = req.query.name || 'cubby';

    if (!Array.isArray(entries)) return next(new HttpError(400, 'entries must be a non-empty stringified array'));

    debug(`download: type=zip skipPath=${skipPath}`, entries);

    const archive = archiver('zip', {
        zlib: { level: 9 }
    });

    archive.on('warning', function (error) {
        debug('download: archiver warning:', error);
    });

    // good practice to catch this error explicitly
    archive.on('error', function (error) {
        console.error('download: archiver error:', error);
        next(new HttpError(500, error));
    });

    // collect and attach all requested files
    for (const resourcePath of entries) {
        try {
            const resource = resourcePath.split('/')[1];
            if (!resource) return next(new HttpError(400, 'invalid resource'));
            const filePath = resourcePath.slice(resource.length+1);

            let file = null;

            if (resource === 'home') {
                file = await files.get(req.user.username, filePath);
            } else if (resource === 'shares') {
                const shareId = filePath.split('/')[1];
                if (!shareId)  return next(new HttpError(404, 'missing share id'));

                const share = await shares.get(shareId);
                if (!share) return next(new HttpError(404, 'no such share'));

                // actual path is without shares/<shareId>/
                const actualFilePath = filePath.split('/').slice(2).join('/');

                file = await files.get(share.owner, path.join(share.filePath, actualFilePath));
            } else if (resource === 'groupfolders') {
                const groupFolderSlug = filePath.split('/')[1];
                if (!groupFolderSlug)  return next(new HttpError(404, 'missing groupFolderSlug'));

                const groupFolder = await groupFolders.get(groupFolderSlug);
                if (!groupFolder) return next(new HttpError(404, 'no such groupfolder'));

                // actual path is without groupfolders/<slug>/
                const actualFilePath = filePath.split('/').slice(2).join('/');

                file = await files.get('groupfolder-' + groupFolderSlug, actualFilePath);
            } else {
                return next(new HttpError(404, `resource ${resource} not supported for download`));
            }

            debug(`download: add ${file.isDirectory ? 'directory' : 'file'} to archive: ${file._fullFilePath} as ${file.filePath.slice(skipPath.length)}`);

            if (file.isDirectory) archive.directory(file._fullFilePath, file.filePath.slice(skipPath.length));
            else archive.file(file._fullFilePath, { name: file.filePath.slice(skipPath.length) });
        } catch (error) {
            console.error('download: cannot get file', resourcePath, error);
            if (error.reason === MainError.NOT_FOUND) return next(new HttpError(404, 'file not found'));
            return next(new HttpError(500, error));
        }
    }

    res.attachment(`${name}.zip`);
    archive.pipe(res);

    archive.finalize();
}

async function recent(req, res, next) {
    assert.strictEqual(typeof req.user, 'object');

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
}

async function search(req, res, next) {
    assert.strictEqual(typeof req.user, 'object');

    const query = req.query.query || '';
    if (!query) return next(new HttpError(400, 'non-empty query arg required'));

    debug(`search: ${req.user.username} ${query}`);

    let results;
    try {
        results = await recoll.searchByUsername(req.user.username, query);
    } catch (e) {
        console.error('search error:', e);
        return next(new HttpError(500, 'search failed'));
    }

    next(new HttpSuccess(200, { results }));
}
