'use strict';

exports = module.exports = {
    getHandle,
    checkFileInfo,
    getFile,
    putFile
};

var assert = require('assert'),
    crypto = require('crypto'),
    debug = require('debug')('cubby:routes:office'),
    superagent = require('superagent'),
    MainError = require('../mainerror.js'),
    files = require('../files.js'),
    translateResourcePath = require('./files.js').translateResourcePath,
    config = require('../config.js'),
    tokens = require('../tokens.js'),
    Dom = require('xmldom').DOMParser,
    xpath = require('xpath'),
    HttpError = require('connect-lastmile').HttpError,
    HttpSuccess = require('connect-lastmile').HttpSuccess;

const HANDLES = {};

async function getHandle(req, res, next) {
    const resourcePath = decodeURIComponent(req.query.resourcePath);
    if (!resourcePath) return next(new HttpError(400, 'resourcePath must be a non-empty string'));

    const collaboraHost = config.get('collabora.host', '');
    if (!collaboraHost) return next(new HttpError(412, 'collabora office not configured'));

    let result;
    try {
        result = await superagent.get(`${collaboraHost}/hosting/discovery`);
    } catch (error) {
        return next(new HttpError(500, error));
    }

    var doc = new Dom().parseFromString(result.text);
    if (!doc) return next(new HttpError(500, 'The retrieved discovery.xml file is not a valid XML file'));

    // currently for collabora urlsrc for all mimeTypes is the same
    var mimeType = 'text/plain';
    var nodes = xpath.select("/wopi-discovery/net-zone/app[@name='" + mimeType + "']/action", doc);
    if (!nodes || nodes.length !== 1) return next(new HttpError(500, 'The requested mime type is not handled'));

    const subject = await translateResourcePath(req.user, resourcePath);
    if (!subject) return next(new HttpError(403, 'not allowed'));

    debug(`getHandle: ${subject.resource} ${subject.filePath}`);

    const handleId = 'hid-' + crypto.randomBytes(32).toString('hex');
    HANDLES[handleId] = {
        username: subject.usernameOrGroup,
        resourcePath: resourcePath,
        filePath: subject.filePath
    };

    const token = await tokens.add(req.user.username);
    const onlineUrl = nodes[0].getAttribute('urlsrc');

    res.json({
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
        UserId: req.user.username,
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

    return res.sendFile(result._fullFilePath);
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

    const handle = HANDLES[handleId];
    if (!handle)  return next(new HttpError(404, 'not found'));

    try {
        await files.addOrOverwriteFileContents(handle.username, handle.filePath, req.body, null, true);
    } catch (error) {
        return next(new HttpError(500, error));
    }

    next(new HttpSuccess(200, { LastModifiedTime: new Date().toISOString() }));
}
