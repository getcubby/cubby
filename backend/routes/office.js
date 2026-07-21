import assert from 'assert';
import constants from '../constants.js';
import settings from '../settings.js';
import crypto from 'crypto';
import debug from 'debug';
import { DOMParser as Dom } from 'xmldom';
import files from '../files.js';
import { HttpError, HttpSuccess } from '@cloudron/connect-lastmile';
import MainError from '../mainerror.js';
import mime from '../mime.js';
import office from '../office.js';
import safe from '@cloudron/safetydance';
import tokens from '../tokens.js';
import users from '../users.js';
import xpath from 'xpath';

const debugLog = debug('cubby:routes:office');

function cleanExpiredLocks() {
    const now = Date.now();
    for (const handleId of Object.keys(LOCKS)) {
        if (now - LOCKS[handleId].createdAt > WOPI_LOCK_TTL) {
            debugLog(`cleanExpiredLocks: removing expired lock for ${handleId}`);
            delete LOCKS[handleId];
        }
    }
}

function generateHandleId(username, filePath) {
    return 'hid-' + crypto.createHash('sha256').update(`${username}:${filePath}`).digest('hex');
}

const HANDLES = {};
const LOCKS = {};
const WOPI_LOCK_TTL = 30 * 60 * 1000;

function getAccessTokenFromRequest(req) {
    let accessToken = req.query.access_token || req.body?.accessToken || '';
    if (req.headers?.authorization) {
        const parts = req.headers.authorization.split(' ');
        if (parts.length === 2 && /^Bearer$/i.test(parts[0])) accessToken = parts[1];
    }
    return accessToken;
}

async function wopiAuth(req, res, next) {
    const accessToken = getAccessTokenFromRequest(req);
    if (!accessToken) return next(new HttpError(401, 'Invalid Access Token'));

    const [error, user] = await safe(users.getByAccessToken(accessToken));
    if (error) return next(MainError.toHttpError(error));

    if (user) {
        req.user = user;
        return next();
    }

    const handleId = req.params.handleId;
    const handle = handleId ? HANDLES[handleId] : null;
    if (handle && handle.token === accessToken) {
        req.user = { username: handle.username, displayName: 'Anonymous' };
        return next();
    }

    return next(new HttpError(401, 'Invalid Access Token'));
}

async function getHandle(req, res, next) {
    const resourcePath = decodeURIComponent(req.query.resourcePath);
    if (!resourcePath) return next(new HttpError(400, 'resourcePath must be a non-empty string'));

    const collabora = await settings.getJson(settings.COLLABORA_KEY);
    const collaboraHost = collabora?.host || '';
    if (!collaboraHost) return next(new HttpError(412, 'office endpoint not configured'));

    const subject = await files.translateResourcePath(req.user?.username ?? null, resourcePath);
    if (!subject) return next(new HttpError(403, 'not allowed'));

    const [fetchError, discoveryRes] = await safe(fetch(`${collaboraHost}/hosting/discovery`));
    if (fetchError) {
        if (fetchError.code === 'ENOTFOUND') return next(new HttpError(412, 'office endpoint not configured'));
        return next(new HttpError(500, fetchError));
    }

    const [textError, discoveryText] = await safe(discoveryRes.text());
    if (textError) return next(new HttpError(500, textError));

    const doc = new Dom().parseFromString(discoveryText);

    if (!doc) return next(new HttpError(500, 'The retrieved discovery.xml file is not a valid XML file'));

    const mimeType = mime(subject.filePath);
    debugLog(`getHandle: ${subject.resource} ${subject.filePath} with mimetype ${mimeType}`);

    const nodes = xpath.select(`/wopi-discovery/net-zone/app[@name='${mimeType}']/action`, doc);
    if (!nodes || !nodes.length) return next(new HttpError(500, 'The requested mime type is not handled'));

    const onlineUrl = nodes[0].getAttribute('urlsrc');

    if (!req.user) {
        const token = crypto.randomBytes(32).toString('hex');
        const handleId = 'hid-' + crypto.randomBytes(32).toString('hex');
        HANDLES[handleId] = {
            username: subject.usernameOrGroupfolder,
            resourcePath: resourcePath,
            filePath: subject.filePath,
            users: { [subject.usernameOrGroupfolder]: { readonly: subject.share?.readonly || false } },
            token: token,
        };
        return res.status(200).json({ handleId, url: onlineUrl, token });
    }

    const handleId = generateHandleId(subject.usernameOrGroupfolder, subject.filePath);

    if (HANDLES[handleId]) {
        HANDLES[handleId].users[req.user.username] = { readonly: subject.share?.readonly || false };
        const token = await tokens.add(req.user.username);
        return res.status(200).json({ handleId, url: onlineUrl, token });
    }

    const token = await tokens.add(req.user.username);
    HANDLES[handleId] = {
        username: subject.usernameOrGroupfolder,
        resourcePath: resourcePath,
        filePath: subject.filePath,
        users: { [req.user.username]: { readonly: subject.share?.readonly || false } },
        token: null,
    };

    res.status(200).json({
        handleId,
        url: onlineUrl,
        token: token
    });
}

async function postFile(req, res, next) {
    assert.strictEqual(typeof req.user, 'object');

    const handleId = req.params.handleId;
    if (!handleId) return next(new HttpError(400, 'missing or invalid handleId'));

    const handle = HANDLES[handleId];
    if (!handle) return next(new HttpError(404, 'not found'));

    const override = (req.headers['x-wopi-override'] || '').toUpperCase();
    const wopiLock = req.headers['x-wopi-lock'] || '';
    const wopiOldLock = req.headers['x-wopi-oldlock'] || '';

    debugLog(`postFile: ${handleId} override=${override}`);

    switch (override) {
        case 'LOCK': {
            const existingLock = LOCKS[handleId];
            if (existingLock) {
                if (wopiOldLock && existingLock.lockId === wopiOldLock) {
                    const newLockId = crypto.randomUUID();
                    LOCKS[handleId] = { lockId: newLockId, username: req.user.username, createdAt: Date.now() };
                    res.set('X-WOPI-Lock', newLockId);
                    return next(new HttpSuccess(200, {}));
                }
                if (wopiLock && existingLock.lockId === wopiLock) {
                    existingLock.createdAt = Date.now();
                    res.set('X-WOPI-Lock', wopiLock);
                    return next(new HttpSuccess(200, {}));
                }
                if (existingLock.username === req.user.username) {
                    const newLockId = crypto.randomUUID();
                    LOCKS[handleId] = { lockId: newLockId, username: req.user.username, createdAt: Date.now() };
                    res.set('X-WOPI-Lock', newLockId);
                    return next(new HttpSuccess(200, {}));
                }
                res.set('X-WOPI-Lock', existingLock.lockId);
                return next(new HttpError(409, 'Lock mismatch/Locked by another user'));
            }
            const newLockId = crypto.randomUUID();
            LOCKS[handleId] = { lockId: newLockId, username: req.user.username, createdAt: Date.now() };
            res.set('X-WOPI-Lock', newLockId);
            return next(new HttpSuccess(200, {}));
        }
        case 'GET_LOCK': {
            const existingLock = LOCKS[handleId];
            res.set('X-WOPI-Lock', existingLock ? existingLock.lockId : '');
            return next(new HttpSuccess(200, {}));
        }
        case 'REFRESH_LOCK': {
            const existingLock = LOCKS[handleId];
            if (!existingLock) {
                res.set('X-WOPI-Lock', '');
                return next(new HttpError(409, 'Lock mismatch'));
            }
            if (wopiLock !== existingLock.lockId) {
                res.set('X-WOPI-Lock', existingLock.lockId);
                return next(new HttpError(409, 'Lock mismatch'));
            }
            existingLock.createdAt = Date.now();
            return next(new HttpSuccess(200, {}));
        }
        case 'UNLOCK': {
            const existingLock = LOCKS[handleId];
            if (!existingLock) {
                res.set('X-WOPI-Lock', '');
                return next(new HttpSuccess(200, {}));
            }
            if (wopiLock !== existingLock.lockId) {
                res.set('X-WOPI-Lock', existingLock.lockId);
                return next(new HttpError(409, 'Lock mismatch'));
            }
            delete LOCKS[handleId];
            res.set('X-WOPI-Lock', '');
            return next(new HttpSuccess(200, {}));
        }
        default:
            return next(new HttpError(400, 'X-WOPI-Override header is required'));
    }
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

    debugLog(`checkFileInfo: ${handleId}`);

    const handle = HANDLES[handleId];
    if (!handle)  return next(new HttpError(404, 'not found'));

    const [error, result] = await safe(files.get(handle.username, handle.filePath));
    if (error) return next(MainError.toHttpError(error));

    if (result.isDirectory) return next(new HttpError(417, 'not supported for directories'));

    const userInfo = handle.users[req.user.username];
    next(new HttpSuccess(200, {
        BaseFileName: result.fileName,
        Size: result.size,
        LastModifiedTime: result.mtime.toISOString(),
        // also OwnerId would be supported https://sdk.collaboraonline.com/docs/How_to_integrate.html#authentication
        UserId: req.user.username,
        UserFriendlyName: req.user.displayName || req.user.username,
        UserCanWrite: userInfo ? !userInfo.readonly : false,
        SupportsLocks: true
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

    debugLog(`getFile: ${handleId}`);

    const handle = HANDLES[handleId];
    if (!handle)  return next(new HttpError(404, 'not found'));

    const [error, result] = await safe(files.get(handle.username, handle.filePath));
    if (error) return next(MainError.toHttpError(error));

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

    debugLog(`putFile: ${handleId} ${req.body.length}`);

    if (!req.body.length) {
        debugLog(`putFile: ${handleId} has empty body. Probably a bug in the body parser...but continuing with 200`);
        return next(new HttpSuccess(200, {}));
    }

    const handle = HANDLES[handleId];
    if (!handle)  return next(new HttpError(404, 'not found'));

    const userInfo = handle.users[req.user.username];
    if (userInfo && userInfo.readonly) return next(new HttpError(403, 'share is readonly'));

    const wopiLock = req.headers['x-wopi-lock'] || '';
    const existingLock = LOCKS[handleId];
    if (existingLock && wopiLock !== existingLock.lockId) {
        res.set('X-WOPI-Lock', existingLock.lockId);
        return next(new HttpError(409, 'Lock mismatch'));
    }

    const [error] = await safe(files.addOrOverwriteFileContents(handle.username, handle.filePath, req.body, null, true, { actor: req.user.username }));
    if (error) return next(MainError.toHttpError(error));

    next(new HttpSuccess(200, { LastModifiedTime: new Date().toISOString() }));
}

async function getSettings(req, res, next) {
    const officeSettings = await settings.getJson(settings.COLLABORA_KEY);
    return next(new HttpSuccess(200, officeSettings || { host: '' }));
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

    const [error] = await safe(settings.setJson(settings.COLLABORA_KEY, { host: req.body.host || '' }));
    if (error) {
        console.error(error);
        return next(new HttpError(500, 'failed to commit office settings'));
    }

    next(new HttpSuccess(200, {}));
}

if (!constants.TEST) {
    setInterval(cleanExpiredLocks, 5 * 60 * 1000);
}

export default {
    wopiAuth,
    getHandle,
    checkFileInfo,
    getFile,
    putFile,
    postFile,
    getSettings,
    setSettings
};
