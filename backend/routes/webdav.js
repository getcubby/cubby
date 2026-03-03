import path from 'path';
import debug from 'debug';
import users from '../users.js';
import files from '../files.js';
import shares from '../shares.js';
import groupFolders from '../groupfolders.js';
import MainError from '../mainerror.js';
import mime from '../mime.js';

const debugLog = debug('cubby:webdav');

const DAV_NS = 'DAV:';
const WEBDAV_PREFIX = '/webdav/';

// Virtual root segment names (URL path segments and display names)
const VIRTUAL_HOME = { segment: 'home', displayName: 'Home' };
const VIRTUAL_SHARES = { segment: 'shares', displayName: 'Shared with you' };
const VIRTUAL_GROUPFOLDERS = { segment: 'groupfolders', displayName: 'Groupfolders' };

/**
 * Parse WebDAV path after /webdav/username/ into normalized segments (no leading/trailing slash).
 * Returns { username, segments[], pathStr } or null if invalid.
 */
function parseWebdavPath(reqPath) {
    if (!reqPath.startsWith(WEBDAV_PREFIX)) return null;
    const after = reqPath.slice(WEBDAV_PREFIX.length).replace(/\/+/g, '/').replace(/^\//, '').replace(/\/$/, '');
    const parts = after ? after.split('/').map(p => decodeURIComponent(p)) : [];
    const username = parts[0];
    if (!username) return null;
    const segments = parts.slice(1);
    return { username, segments, pathStr: segments.join('/') };
}

/**
 * Map WebDAV path segments to resourcePath (e.g. /home/, /shares/id/, /groupfolders/id/).
 * Returns { resourcePath, virtualRoot, virtualSharesList, virtualGroupfoldersList }.
 */
function webdavSegmentsToResource(segments) {
    if (segments.length === 0) {
        return { virtualRoot: true };
    }
    const first = segments[0].toLowerCase();
    if (first === VIRTUAL_HOME.segment) {
        const rest = segments.slice(1).join('/');
        // Use '/home/' for root so files.get receives filePath '/' (Entry requires truthy filePath)
        return { resourcePath: rest ? '/home/' + rest : '/home/' };
    }
    if (first === VIRTUAL_SHARES.segment) {
        if (segments.length === 1) return { virtualSharesList: true };
        const shareId = segments[1];
        const rest = segments.slice(2).join('/');
        return { resourcePath: '/shares/' + shareId + (rest ? '/' + rest : '') };
    }
    if (first === VIRTUAL_GROUPFOLDERS.segment) {
        if (segments.length === 1) return { virtualGroupfoldersList: true };
        const groupId = segments[1];
        const rest = segments.slice(2).join('/');
        return { resourcePath: '/groupfolders/' + groupId + (rest ? '/' + rest : '') };
    }
    return null;
}

/**
 * Authenticate request via Basic auth. Returns user object or null.
 */
async function authFromRequest(req) {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Basic ')) {
        debugLog('auth: no Authorization or not Basic');
        return null;
    }
    try {
        const b64 = auth.slice(6).trim();
        const decoded = Buffer.from(b64, 'base64').toString('utf8');
        const i = decoded.indexOf(':');
        if (i === -1) {
            debugLog('auth: no colon in decoded Basic value');
            return null;
        }
        const username = decoded.slice(0, i);
        const password = decoded.slice(i + 1);
        if (!username || !password) {
            debugLog('auth: empty username or password');
            return null;
        }
        debugLog('auth: attempting login for user=%s', username);
        const user = await users.webdavLogin(username, password);
        debugLog('auth: webdavLogin result=%s', user ? 'ok' : 'failed');
        return user;
    } catch (err) {
        debugLog('auth: exception', err);
        return null;
    }
}

function sendXml(res, status, body) {
    res.status(status);
    res.set('Content-Type', 'application/xml; charset="utf-8"');
    res.send(body);
}

function escapeXml(s) {
    if (s == null) return '';
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function formatDate(d) {
    if (!d) return '';
    const date = d instanceof Date ? d : new Date(d);
    return date.toUTCString();
}

function formatISODate(d) {
    if (!d) return '';
    const date = d instanceof Date ? d : new Date(d);
    return date.toISOString();
}

/**
 * Build DAV:prop fragment for a resource (allprop-style).
 */
function propFragment(entry, baseHref, isCollection, displayName, size, mtime, contentType) {
    const lastMod = mtime ? `<D:getlastmodified>${escapeXml(formatDate(mtime))}</D:getlastmodified>` : '';
    const creationDate = mtime ? `<D:creationdate>${escapeXml(formatISODate(mtime))}</D:creationdate>` : '';
    const resourcetype = isCollection ? '<D:resourcetype><D:collection/></D:resourcetype>' : '<D:resourcetype/>';
    const contentLength = !isCollection && size != null ? `<D:getcontentlength>${escapeXml(String(size))}</D:getcontentlength>` : '';
    const contentTypeEl = !isCollection && contentType ? `<D:getcontenttype>${escapeXml(contentType)}</D:getcontenttype>` : '';
    const etag = !isCollection && size != null ? `<D:getetag>"${escapeXml(String(size))}-${mtime ? mtime.getTime() : 0}"</D:getetag>` : '';
    return `<D:prop>
    <D:displayname>${escapeXml(displayName)}</D:displayname>
    ${creationDate}
    ${lastMod}
    ${resourcetype}
    ${contentLength}
    ${contentTypeEl}
    ${etag}
    <D:supportedlock>
      <D:lockentry><D:lockscope><D:exclusive/></D:lockscope><D:locktype><D:write/></D:locktype></D:lockentry>
      <D:lockentry><D:lockscope><D:shared/></D:lockscope><D:locktype><D:write/></D:locktype></D:lockentry>
    </D:supportedlock>
  </D:prop>
  <D:status>HTTP/1.1 200 OK</D:status>`;
}

/**
 * Build a single response element for PROPFIND.
 * Collection hrefs must end with / per RFC 4918.
 */
function propfindResponse(href, entry, isCollection, displayName, size, mtime, contentType) {
    const normalizedHref = isCollection && href && !href.endsWith('/') ? href + '/' : href;
    const hrefEnc = escapeXml(normalizedHref);
    const prop = propFragment(entry, href, isCollection, displayName, size, mtime, contentType);
    return `<D:response>
  <D:href>${hrefEnc}</D:href>
  <D:propstat>
  ${prop}
  </D:propstat>
</D:response>`;
}

/**
 * Handle PROPFIND: list directory or get properties.
 */
async function handlePropfind(req, res, username, segments, pathInfo) {
    const depth = req.headers.depth === 'infinity' || req.headers.depth === '1' ? (req.headers.depth === 'infinity' ? 'infinity' : 1) : 0;
    const baseHref = pathInfo.baseHref;

    const resource = webdavSegmentsToResource(segments);
    if (!resource && segments.length > 0) {
        res.status(404).send('Not Found');
        return;
    }

    const responses = [];

    if (resource.virtualRoot) {
        // Virtual root: Home, Shared with you, Groupfolders
        const rootDisplayName = pathInfo.username || 'Files';
        responses.push(propfindResponse(baseHref, null, true, rootDisplayName, null, new Date(), null));
        if (depth >= 1) {
            const homeHref = baseHref.replace(/\/?$/, '/') + VIRTUAL_HOME.segment + '/';
            const sharesHref = baseHref.replace(/\/?$/, '/') + VIRTUAL_SHARES.segment + '/';
            const gfHref = baseHref.replace(/\/?$/, '/') + VIRTUAL_GROUPFOLDERS.segment + '/';
            responses.push(propfindResponse(homeHref, null, true, VIRTUAL_HOME.displayName, null, new Date(), null));
            responses.push(propfindResponse(sharesHref, null, true, VIRTUAL_SHARES.displayName, null, new Date(), null));
            responses.push(propfindResponse(gfHref, null, true, VIRTUAL_GROUPFOLDERS.displayName, null, new Date(), null));
        }
        sendXml(res, 207, `<?xml version="1.0" encoding="utf-8"?>
<D:multistatus xmlns:D="${DAV_NS}">
${responses.join('\n')}
</D:multistatus>`);
        return;
    }

    if (resource.virtualSharesList) {
        const list = await shares.listSharedWith(username);
        responses.push(propfindResponse(baseHref, null, true, VIRTUAL_SHARES.displayName, null, new Date(), null));
        if (depth >= 1) {
            for (const share of list) {
                const owner = share.ownerGroupfolder ? `groupfolder-${share.ownerGroupfolder}` : share.ownerUsername;
                let file;
                try {
                    file = await files.get(owner, share.filePath);
                } catch (e) {
                    debugLog('share file get failed', share.id, e);
                    continue;
                }
                const name = file.fileName || share.id;
                const childHref = baseHref.replace(/\/?$/, '/') + encodeURIComponent(share.id) + '/';
                responses.push(propfindResponse(childHref, file, true, name, file.size, file.mtime, null));
            }
        }
        sendXml(res, 207, `<?xml version="1.0" encoding="utf-8"?>
<D:multistatus xmlns:D="${DAV_NS}">
${responses.join('\n')}
</D:multistatus>`);
        return;
    }

    if (resource.virtualGroupfoldersList) {
        const list = await groupFolders.list(username);
        responses.push(propfindResponse(baseHref, null, true, VIRTUAL_GROUPFOLDERS.displayName, null, new Date(), null));
        if (depth >= 1) {
            for (const group of list) {
                let file;
                try {
                    file = await files.get(`groupfolder-${group.id}`, '/');
                } catch (e) {
                    debugLog('groupfolder get failed', group.id, e);
                    continue;
                }
                const name = group.name || group.id;
                const childHref = baseHref.replace(/\/?$/, '/') + encodeURIComponent(group.id) + '/';
                responses.push(propfindResponse(childHref, file, true, name, file.size, file.mtime, null));
            }
        }
        sendXml(res, 207, `<?xml version="1.0" encoding="utf-8"?>
<D:multistatus xmlns:D="${DAV_NS}">
${responses.join('\n')}
</D:multistatus>`);
        return;
    }

    // Actual file system path
    const subject = await files.translateResourcePath(username, resource.resourcePath);
    if (!subject) {
        res.status(403).send('Forbidden');
        return;
    }

    let entry;
    try {
        entry = await files.get(subject.usernameOrGroupfolder, subject.filePath);
    } catch (e) {
        if (e.reason === MainError.NOT_FOUND) {
            res.status(404).send('Not Found');
            return;
        }
        debugLog('propfind get error', e);
        res.status(500).send('Internal Server Error');
        return;
    }

    const displayName = entry.fileName || path.basename(subject.filePath) || 'resource';
    responses.push(propfindResponse(baseHref, entry, entry.isDirectory, displayName, entry.size, entry.mtime, entry.isFile ? entry.mimeType : null));

    if (entry.isDirectory && depth >= 1) {
        const childFiles = entry.files || [];
        const dirHref = baseHref.endsWith('/') ? baseHref : baseHref + '/';
        for (const child of childFiles) {
            const childName = child.fileName;
            const childSeg = encodeURIComponent(childName);
            const childHref = dirHref + childSeg + (child.isDirectory ? '/' : '');
            const childContentType = child.isFile ? (child.mimeType || mime(child.filePath)) : null;
            responses.push(propfindResponse(childHref, child, child.isDirectory, childName, child.size, child.mtime, childContentType));
        }
    }

    sendXml(res, 207, `<?xml version="1.0" encoding="utf-8"?>
<D:multistatus xmlns:D="${DAV_NS}">
${responses.join('\n')}
</D:multistatus>`);
}

/**
 * Handle GET: stream file content.
 */
async function handleGet(req, res, username, segments) {
    const resource = webdavSegmentsToResource(segments);
    if (!resource || resource.virtualRoot || resource.virtualSharesList || resource.virtualGroupfoldersList) {
        res.status(405).set('Allow', 'OPTIONS, PROPFIND').send('Method Not Allowed');
        return;
    }
    const subject = await files.translateResourcePath(username, resource.resourcePath);
    if (!subject) {
        res.status(403).send('Forbidden');
        return;
    }
    try {
        const entry = await files.get(subject.usernameOrGroupfolder, subject.filePath);
        if (entry.isDirectory) {
            res.status(405).set('Allow', 'OPTIONS, PROPFIND').send('Method Not Allowed');
            return;
        }
        res.set('Content-Type', entry.mimeType || mime(entry.filePath));
        if (entry.size != null) res.set('Content-Length', String(entry.size));
        if (entry.mtime) res.set('Last-Modified', formatDate(entry.mtime));
        res.sendFile(entry._fullFilePath, { dotfiles: 'allow' });
    } catch (e) {
        if (e.reason === MainError.NOT_FOUND) {
            res.status(404).send('Not Found');
            return;
        }
        res.status(500).send('Internal Server Error');
    }
}

/**
 * Handle HEAD: file metadata only.
 */
async function handleHead(req, res, username, segments) {
    const resource = webdavSegmentsToResource(segments);
    if (!resource || resource.virtualRoot || resource.virtualSharesList || resource.virtualGroupfoldersList) {
        res.status(405).set('Allow', 'OPTIONS, PROPFIND').send('Method Not Allowed');
        return;
    }
    const subject = await files.translateResourcePath(username, resource.resourcePath);
    if (!subject) {
        res.status(403).send('Forbidden');
        return;
    }
    try {
        const headResult = await files.head(subject.usernameOrGroupfolder, subject.filePath);
        res.set('Content-Type', headResult.mimeType || mime(headResult.filePath));
        res.set('Content-Length', String(headResult.size));
        if (headResult.mtime) res.set('Last-Modified', formatDate(headResult.mtime));
        res.status(200).end();
    } catch (e) {
        if (e.reason === MainError.NOT_FOUND) {
            res.status(404).send('Not Found');
            return;
        }
        res.status(500).send('Internal Server Error');
    }
}

/**
 * Handle PUT: create or overwrite file.
 */
async function handlePut(req, res, username, segments) {
    const resource = webdavSegmentsToResource(segments);
    if (!resource || resource.virtualRoot || resource.virtualSharesList || resource.virtualGroupfoldersList) {
        res.status(405).set('Allow', 'OPTIONS, PROPFIND').send('Method Not Allowed');
        return;
    }
    const subject = await files.translateResourcePath(username, resource.resourcePath);
    if (!subject) {
        res.status(403).send('Forbidden');
        return;
    }
    if (subject.share?.readonly) {
        res.status(403).send('Forbidden');
        return;
    }
    const mtime = req.headers['last-modified'] ? new Date(req.headers['last-modified']) : new Date();
    const overwrite = req.headers['if-match'] !== '*' && !req.headers['if-none-match']; // default overwrite
    try {
        await files.addOrOverwriteFile(subject.usernameOrGroupfolder, subject.filePath, req, mtime, true);
        res.status(201).set('Location', req.originalUrl).end();
    } catch (e) {
        if (e.reason === MainError.ALREADY_EXISTS && !overwrite) {
            res.status(412).send('Precondition Failed');
            return;
        }
        if (e.reason === MainError.INVALID_PATH) {
            res.status(409).send('Conflict');
            return;
        }
        res.status(500).send('Internal Server Error');
    }
}

/**
 * Handle MKCOL: create collection (directory).
 */
async function handleMkcol(req, res, username, segments) {
    const resource = webdavSegmentsToResource(segments);
    if (!resource || resource.virtualRoot || resource.virtualSharesList || resource.virtualGroupfoldersList) {
        res.status(405).set('Allow', 'OPTIONS, PROPFIND').send('Method Not Allowed');
        return;
    }
    const subject = await files.translateResourcePath(username, resource.resourcePath);
    if (!subject) {
        res.status(403).send('Forbidden');
        return;
    }
    if (subject.share?.readonly) {
        res.status(403).send('Forbidden');
        return;
    }
    try {
        await files.addDirectory(subject.usernameOrGroupfolder, subject.filePath);
        res.status(201).end();
    } catch (e) {
        if (e.reason === MainError.ALREADY_EXISTS) {
            res.status(405).send('Method Not Allowed');
            return;
        }
        if (e.reason === MainError.INVALID_PATH) {
            res.status(409).send('Conflict');
            return;
        }
        res.status(500).send('Internal Server Error');
    }
}

/**
 * Handle DELETE: remove file or collection.
 */
async function handleDelete(req, res, username, segments) {
    const resource = webdavSegmentsToResource(segments);
    if (!resource || resource.virtualRoot || resource.virtualSharesList || resource.virtualGroupfoldersList) {
        res.status(405).set('Allow', 'OPTIONS, PROPFIND').send('Method Not Allowed');
        return;
    }
    const subject = await files.translateResourcePath(username, resource.resourcePath);
    if (!subject) {
        res.status(403).send('Forbidden');
        return;
    }
    if (subject.share?.readonly) {
        res.status(403).send('Forbidden');
        return;
    }
    try {
        await files.remove(subject.usernameOrGroupfolder, subject.filePath);
        res.status(204).end();
    } catch (e) {
        if (e.reason === MainError.NOT_FOUND) {
            res.status(404).send('Not Found');
            return;
        }
        res.status(500).send('Internal Server Error');
    }
}

/**
 * Resolve destination path from Destination header (same base /webdav/username/).
 */
function parseDestination(destHeader, baseOrigin) {
    if (!destHeader) return null;
    try {
        const u = new URL(destHeader, baseOrigin);
        const pathname = decodeURIComponent(u.pathname);
        if (!pathname.startsWith(WEBDAV_PREFIX)) return null;
        const after = pathname.slice(WEBDAV_PREFIX.length).replace(/\/+/g, '/').replace(/^\//, '').replace(/\/$/, '');
        const parts = after.split('/');
        const destUsername = parts[0];
        const destSegments = parts.slice(1);
        return { destUsername, destSegments };
    } catch {
        return null;
    }
}

/**
 * Handle COPY.
 */
async function handleCopy(req, res, username, segments, pathInfo) {
    const dest = parseDestination(req.headers.destination, pathInfo.origin);
    if (!dest || dest.destUsername !== username) {
        res.status(400).send('Bad Request');
        return;
    }
    const destResource = webdavSegmentsToResource(dest.destSegments);
    if (!destResource || destResource.virtualRoot || destResource.virtualSharesList || destResource.virtualGroupfoldersList) {
        res.status(403).send('Forbidden');
        return;
    }
    const srcResource = webdavSegmentsToResource(segments);
    if (!srcResource || srcResource.virtualRoot || srcResource.virtualSharesList || srcResource.virtualGroupfoldersList) {
        res.status(403).send('Forbidden');
        return;
    }
    const overwrite = req.headers.overwrite !== 'F' && req.headers.overwrite !== 'f';
    const subject = await files.translateResourcePath(username, srcResource.resourcePath);
    const destSubject = await files.translateResourcePath(username, destResource.resourcePath);
    if (!subject || !destSubject) {
        res.status(403).send('Forbidden');
        return;
    }
    if (subject.share?.readonly || destSubject.share?.readonly) {
        res.status(403).send('Forbidden');
        return;
    }
    try {
        await files.copy(subject.usernameOrGroupfolder, subject.filePath, destSubject.usernameOrGroupfolder, destSubject.filePath, overwrite);
        res.status(201).end();
    } catch (e) {
        if (e.reason === MainError.NOT_FOUND) res.status(404).send('Not Found');
        else if (e.reason === MainError.CONFLICT) res.status(412).send('Precondition Failed');
        else res.status(500).send('Internal Server Error');
    }
}

/**
 * Handle MOVE.
 */
async function handleMove(req, res, username, segments, pathInfo) {
    const dest = parseDestination(req.headers.destination, pathInfo.origin);
    if (!dest || dest.destUsername !== username) {
        res.status(400).send('Bad Request');
        return;
    }
    const destResource = webdavSegmentsToResource(dest.destSegments);
    if (!destResource || destResource.virtualRoot || destResource.virtualSharesList || destResource.virtualGroupfoldersList) {
        res.status(403).send('Forbidden');
        return;
    }
    const srcResource = webdavSegmentsToResource(segments);
    if (!srcResource || srcResource.virtualRoot || srcResource.virtualSharesList || srcResource.virtualGroupfoldersList) {
        res.status(403).send('Forbidden');
        return;
    }
    const subject = await files.translateResourcePath(username, srcResource.resourcePath);
    const destSubject = await files.translateResourcePath(username, destResource.resourcePath);
    if (!subject || !destSubject) {
        res.status(403).send('Forbidden');
        return;
    }
    if (subject.share?.readonly || destSubject.share?.readonly) {
        res.status(403).send('Forbidden');
        return;
    }
    try {
        await files.move(subject.usernameOrGroupfolder, subject.filePath, destSubject.usernameOrGroupfolder, destSubject.filePath);
        res.status(201).end();
    } catch (e) {
        if (e.reason === MainError.NOT_FOUND) res.status(404).send('Not Found');
        else if (e.reason === MainError.CONFLICT) res.status(412).send('Precondition Failed');
        else res.status(500).send('Internal Server Error');
    }
}

function expressMiddleware() {
    return async function webdavHandler(req, res, next) {
        if (!req.path.startsWith(WEBDAV_PREFIX)) return next();

        debugLog('request: %s %s', req.method, req.path);

        const pathInfo = parseWebdavPath(req.path);
        if (!pathInfo) {
            debugLog('request: path parse failed for path=%s', req.path);
            return next();
        }
        debugLog('request: parsed username=%s segments=%o', pathInfo.username, pathInfo.segments);

        const user = await authFromRequest(req);
        if (!user) {
            debugLog('request: auth failed, sending 401');
            res.set('WWW-Authenticate', 'Basic realm="Cubby"');
            res.status(401).send('Unauthorized');
            return;
        }

        if (pathInfo.username !== user.username) {
            debugLog('request: path username %s !== auth username %s, sending 403', pathInfo.username, user.username);
            res.status(403).send('Forbidden');
            return;
        }

        debugLog('request: authenticated as %s, handling %s', user.username, req.method);

        // Base href for PROPFIND responses: request URL normalized
        const origin = req.protocol + '://' + req.get('host');
        const pathWithoutTrailing = req.path.replace(/\/$/, '');
        pathInfo.baseHref = origin + pathWithoutTrailing + (pathWithoutTrailing === (WEBDAV_PREFIX + pathInfo.username) ? '/' : '');
        pathInfo.origin = origin;

        const username = user.username;
        const { segments } = pathInfo;

        try {
            switch (req.method) {
                case 'OPTIONS':
                    res.set('DAV', '1, 2');
                    res.set('Allow', 'OPTIONS, PROPFIND, PROPPATCH, MKCOL, GET, HEAD, PUT, DELETE, COPY, MOVE');
                    res.status(200).end();
                    return;
                case 'PROPFIND':
                    await handlePropfind(req, res, username, segments, pathInfo);
                    return;
                case 'GET':
                    await handleGet(req, res, username, segments);
                    return;
                case 'HEAD':
                    await handleHead(req, res, username, segments);
                    return;
                case 'PUT':
                    await handlePut(req, res, username, segments);
                    return;
                case 'MKCOL':
                    await handleMkcol(req, res, username, segments);
                    return;
                case 'DELETE':
                    await handleDelete(req, res, username, segments);
                    return;
                case 'COPY':
                    await handleCopy(req, res, username, segments, pathInfo);
                    return;
                case 'MOVE':
                    await handleMove(req, res, username, segments, pathInfo);
                    return;
                default:
                    res.status(405).set('Allow', 'OPTIONS, PROPFIND, MKCOL, GET, HEAD, PUT, DELETE, COPY, MOVE').send('Method Not Allowed');
            }
        } catch (err) {
            debugLog('webdav error: %s', err.message || err);
            res.status(500).send('Internal Server Error');
        }
    };
}

export default {
    express: expressMiddleware
};
