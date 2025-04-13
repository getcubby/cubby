'use strict';

exports = module.exports = {
    getHandle,
    checkFileInfo,
    getFile,
    putFile,
    getSettings,
    setSettings
};

var assert = require('assert'),
    config = require('../config.js'),
    crypto = require('crypto'),
    debug = require('debug')('cubby:routes:office'),
    Dom = require('xmldom').DOMParser,
    files = require('../files.js'),
    HttpError = require('connect-lastmile').HttpError,
    HttpSuccess = require('connect-lastmile').HttpSuccess,
    MainError = require('../mainerror.js'),
    mime = require('../mime.js'),
    office = require('../office.js'),
    safe = require('safetydance'),
    tokens = require('../tokens.js'),
    translateResourcePath = require('./files.js').translateResourcePath,
    xpath = require('xpath');

const HANDLES = {};

async function getHandle(req, res, next) {
    const resourcePath = decodeURIComponent(req.query.resourcePath);
    if (!resourcePath) return next(new HttpError(400, 'resourcePath must be a non-empty string'));

    const collaboraHost = config.get('collabora.host', '');
    if (!collaboraHost) return next(new HttpError(412, 'office endpoint not configured'));

    const subject = await translateResourcePath(req.user, resourcePath);
    if (!subject) return next(new HttpError(403, 'not allowed'));

    let doc;
    try {
        const res = await fetch(`${collaboraHost}/hosting/discovery`);
        doc = new Dom().parseFromString(await res.text());
    } catch (error) {
        if (error && error.code === 'ENOTFOUND') return next(new HttpError(412, 'office endpoint not configured'));
        return next(new HttpError(500, error));
    }

    if (!doc) return next(new HttpError(500, 'The retrieved discovery.xml file is not a valid XML file'));

    const mimeType = mime(subject.filePath);
    const nodes = xpath.select("/wopi-discovery/net-zone/app[@name='" + mimeType + "']/action", doc);
    if (!nodes || !nodes.length) return next(new HttpError(500, 'The requested mime type is not handled'));

    debug(`getHandle: ${subject.resource} ${subject.filePath}`);

    const handleId = 'hid-' + crypto.randomBytes(32).toString('hex');
    HANDLES[handleId] = {
        username: subject.usernameOrGroupfolder,
        resourcePath: resourcePath,
        filePath: subject.filePath
    };

    const token = await tokens.add(req.user.username);
    const onlineUrl = nodes[0].getAttribute('urlsrc');

    res.status(200).json({
        handleId,
        url: onlineUrl,
        token: token
    });
}

/* *
 *  wopi CheckFileInfo endpoint
 *
 *  Returns info about the file with the given document id.
 *  The response has to be in JSON format and at a minimum it needs to include
 *  the file name and the file size.
 *  The CheckFileInfo wopi endpoint is triggered by a GET request at
 *  https://HOSTNAME/wopi/files/<document_id>
 */
async function checkFileInfo(req, res, next) {
    assert.strictEqual(typeof req.user, 'object');

    const handleId = req.params.handleId;
    if (!handleId) return next(new HttpError(400, 'missing or invalid handleId'));

    debug(`checkFileInfo: ${handleId}`);

    const handle = HANDLES[handleId];
    if (!handle)  return next(new HttpError(404, 'not found'));

    let result;
    try {
        result = await files.get(handle.username, handle.filePath);
    } catch (error) {
        if (error.reason === MainError.NOT_FOUND) return next(new HttpError(404, 'not found'));
        return next(new HttpError(500, error));
    }

    if (result.isDirectory) return next(new HttpError(417, 'not supported for directories'));

    next(new HttpSuccess(200, {
        BaseFileName: result.fileName,
        Size: result.size,
        LastModifiedTime: result.mtime.toISOString(),
        // also OwnerId would be supported https://sdk.collaboraonline.com/docs/How_to_integrate.html#authentication
        UserId: req.user.username,
        UserFriendlyName: req.user.displayName || req.user.username,
        UserCanWrite: true
    }));
}

/* *
 *  wopi GetFile endpoint
 *
 *  Given a request access token and a document id, sends back the contents of the file.
 *  The GetFile wopi endpoint is triggered by a request with a GET verb at
 *  https://HOSTNAME/wopi/files/<document_id>/contents
 */
async function getFile(req, res, next) {
    assert.strictEqual(typeof req.user, 'object');

    const handleId = req.params.handleId;
    if (!handleId) return next(new HttpError(400, 'missing or invalid handleId'));

    debug(`getFile: ${handleId}`);

    const handle = HANDLES[handleId];
    if (!handle)  return next(new HttpError(404, 'not found'));

    let result;
    try {
        result = await files.get(handle.username, handle.filePath);
    } catch (error) {
        if (error.reason === MainError.NOT_FOUND) return next(new HttpError(404, 'not found'));
        return next(new HttpError(500, error));
    }

    if (result.isDirectory) return next(new HttpError(417, 'not supported for directories'));

    return res.sendFile(result._fullFilePath, { dotfiles: 'allow' });
}

/* *
 *  wopi PutFile endpoint
 *
 *  Given a request access token and a document id, replaces the files with the POST request body.
 *  The PutFile wopi endpoint is triggered by a request with a POST verb at
 *  https://HOSTNAME/wopi/files/<document_id>/contents
 */
async function putFile(req, res, next) {
    if (!req.body) return next(new HttpError(500, 'no body provided'));

    const handleId = req.params.handleId;
    if (!handleId) return next(new HttpError(400, 'missing or invalid handleId'));

    debug(`putFile: ${handleId} ${req.body.length}`);

    if (!req.body.length) {
        debug(`putFile: ${handleId} has empty body. Probably a bug in the body parser...but continuing with 200`);
        return next(new HttpSuccess(200, {}));
    }

    const handle = HANDLES[handleId];
    if (!handle)  return next(new HttpError(404, 'not found'));

    try {
        await files.addOrOverwriteFileContents(handle.username, handle.filePath, req.body, null, true);
    } catch (error) {
        return next(new HttpError(500, error));
    }

    next(new HttpSuccess(200, { LastModifiedTime: new Date().toISOString() }));
}

async function getSettings(req, res, next) {
    const officeSettings = config.get('collabora');
    return next(new HttpSuccess(200, officeSettings));
}

async function setSettings(req, res, next) {
    if (req.body.host) {
        // basic host testing
        const [error, result] = await safe(office.getSupportedExtensions(req.body.host));
        if (error) {
            console.error(`Failed to connect to WOPI host ${req.body.host}`, error);
            return next(new HttpError(412, 'Cannot connect to WOPI host'));
        }

        if (result.length === 0) return next(new HttpError(412, 'Does not appear to be a supported WOPI host'));
    }

    try {
        config.set('collabora', { host: req.body.host || '' });
    } catch (e) {
        console.error(e);
        return next(new HttpError(500, 'failed to commit office settings'));
    }

    next(new HttpSuccess(200, {}));
}
