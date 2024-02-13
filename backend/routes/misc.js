'use strict';

exports = module.exports = {
    getPreview,
    download
};

var assert = require('assert'),
    archiver = require('archiver'),
    debug = require('debug')('cubby:routes:misc'),
    files = require('../files.js'),
    MainError = require('../mainerror.js'),
    path = require('path'),
    preview = require('../preview.js'),
    shares = require('../shares.js'),
    HttpError = require('connect-lastmile').HttpError;

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
    }

    next(new HttpError(404, 'not found'));
}

async function download(req, res, next) {
    assert.strictEqual(typeof req.user, 'object');

    let entries;
    try {
        entries = JSON.parse(req.query.entries);
        if (!Array.isArray(entries)) return next(new HttpError(400, 'entries must be a non-empty stringified array'));
    } catch (e) {
        return next(new HttpError(400, 'entries must be a non-empty stringified array'));
    }

    const skipPath = req.query.skipPath || '';
    const name = req.query.name || 'cubby';

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

    res.attachment(`${name}.zip`);
    archive.pipe(res);

    // collect and attach all requested files
    for (const entry of entries) {
        try {
            const resource = decodeURIComponent(entry.resourcePath).split('/')[1];
            if (!resource) return next(new HttpError(400, 'invalid resource'));
            const filePath = decodeURIComponent(entry.resourcePath).slice(resource.length+1);

            let file = null;

            if (resource === 'home') {
                file = await files.get(req.user.username /* FIXME should be resource */, filePath);
            } else if (resource === 'shares') {
                const shareId = filePath.split('/')[1];
                if (!shareId)  return next(new HttpError(404, 'missing share id'));

                const share = await shares.get(shareId);
                if (!share) return next(new HttpError(404, 'no such share'));

                // actual path is without shares/<shareId>/
                const shareFilePath = filePath.split('/').slice(2).join('/');

                try {
                    file = await files.get(share.owner, path.join(share.filePath, shareFilePath));
                } catch (error) {
                    if (error.reason === MainError.NOT_FOUND) return next(new HttpError(404, 'file not found'));
                    return next(new HttpError(500, error));
                }
            } else {
                return next(new HttpError(404, `resource ${resource} not supported for download`));
            }

            debug(`download: add ${entry.isDirectory ? 'directory' : 'file'} to archive: ${file._fullFilePath} as ${file.filePath.slice(skipPath.length)}`);

            if (file.isDirectory) archive.directory(file._fullFilePath, file.filePath.slice(skipPath.length));
            else archive.file(file._fullFilePath, { name: file.filePath.slice(skipPath.length) });
        } catch (error) {
            console.error('download: cannot get entry', entry, error);
        }
    }

    archive.finalize();
}