import path from 'path';
import debug from 'debug';
import files from '../files.js';
import shares from '../shares.js';
import groupFolders from '../groupfolders.js';
import MainError from '../mainerror.js';
import mime from '../mime.js';

const debugLog = debug('cubby:webdav');

const DAV_NS = 'DAV:';
const WEBDAV_PREFIX = '/webdav/';
const LOCAL_WEBDAV_PASSWORD = 'password';

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
async function verifyCloudronCredentials(identifier, password) {
    const url = `http://${process.env.CLOUDRON_PROXY_IP}:3006/verify-credentials`;
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password })
    });
    return response.ok;
}

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

        if (process.env.CLOUDRON) {
            try {
                const ok = await verifyCloudronCredentials(username, password);
                debugLog('auth: cloudron verify result=%s', ok ? 'ok' : 'failed');
                return ok ? { username } : null;
            } catch (error) {
                debugLog('auth: cloudron verify failed %s', error.message || error);
                return null;
            }
        }

        const ok = password === LOCAL_WEBDAV_PASSWORD;
        debugLog('auth: local password result=%s', ok ? 'ok' : 'failed');
        return ok ? { username } : null;
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

    let displayName = entry.fileName || path.basename(subject.filePath);
    if (!displayName && segments.length > 0) {
        const lastSegment = segments[segments.length - 1].toLowerCase();
        if (lastSegment === VIRTUAL_HOME.segment) displayName = VIRTUAL_HOME.displayName;
        else if (lastSegment === VIRTUAL_SHARES.segment) displayName = VIRTUAL_SHARES.displayName;
        else if (lastSegment === VIRTUAL_GROUPFOLDERS.segment) displayName = VIRTUAL_GROUPFOLDERS.displayName;
        else displayName = segments[segments.length - 1];
    }
    if (!displayName) displayName = 'resource';
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
 * Overwrite is allowed unless client sends If-None-Match: * (create-only).
 * Returns 204 when overwriting, 201 when creating (for Windows compatibility).
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
    // Only refuse overwrite when client explicitly asks for create-only (If-None-Match: *)
    const overwrite = req.headers['if-none-match'] !== '*';
    let existed = false;
    try {
        try {
            await files.get(subject.usernameOrGroupfolder, subject.filePath);
            existed = true;
        } catch (e) {
            if (e.reason !== MainError.NOT_FOUND) throw e;
        }
        await files.addOrOverwriteFile(subject.usernameOrGroupfolder, subject.filePath, req, mtime, overwrite);
        res.status(existed ? 204 : 201).set('Location', req.originalUrl).end();
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
 * Generate an opaque lock token for LOCK (Windows Explorer expects this format).
 */
function generateLockToken() {
    const hex = () => Math.floor(Math.random() * 16).toString(16);
    const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) =>
        (c === 'x' ? hex() : ((parseInt(hex(), 16) & 0x3) | 0x8).toString(16))
    );
    return `opaquelocktoken:${uuid}`;
}

/**
 * Handle LOCK: required by Windows Explorer for uploads. We return success with a token
 * but do not enforce locking (no-op lock store).
 */
async function handleLock(req, res, username, segments) {
    const resource = webdavSegmentsToResource(segments);
    if (!resource || resource.virtualRoot || resource.virtualSharesList || resource.virtualGroupfoldersList) {
        res.status(405).set('Allow', 'OPTIONS, PROPFIND').send('Method Not Allowed');
        return;
    }
    const lockToken = generateLockToken();
    const body = `<?xml version="1.0" encoding="utf-8"?>
<D:prop xmlns:D="${DAV_NS}">
  <D:lockdiscovery>
    <D:activelock>
      <D:locktype><D:write/></D:locktype>
      <D:lockscope><D:exclusive/></D:lockscope>
      <D:depth>Infinity</D:depth>
      <D:owner/>
      <D:timeout>Second-3600</D:timeout>
      <D:locktoken>
        <D:href>${escapeXml(lockToken)}</D:href>
      </D:locktoken>
    </D:activelock>
  </D:lockdiscovery>
</D:prop>`;
    res.status(200);
    res.set('Content-Type', 'application/xml; charset="utf-8"');
    res.set('Lock-Token', `<${lockToken}>`);
    res.send(body);
}

/**
 * Handle UNLOCK: required by Windows Explorer. Accept any Lock-Token and return 204.
 */
async function handleUnlock(req, res, username, segments) {
    const resource = webdavSegmentsToResource(segments);
    if (!resource || resource.virtualRoot || resource.virtualSharesList || resource.virtualGroupfoldersList) {
        res.status(405).set('Allow', 'OPTIONS, PROPFIND').send('Method Not Allowed');
        return;
    }
    res.status(204).end();
}

/**
 * Handle PROPPATCH: Windows Explorer may send property updates. Return 207 with 403
 * for each property so the client gets a valid multistatus response (required for Windows).
 */
async function handleProppatch(req, res, username, segments, pathInfo) {
    const baseHref = pathInfo.baseHref;
    const hrefEnc = escapeXml(baseHref);
    const body = `<?xml version="1.0" encoding="utf-8"?>
<D:multistatus xmlns:D="${DAV_NS}">
  <D:response>
    <D:href>${hrefEnc}</D:href>
    <D:propstat>
      <D:prop/>
      <D:status>HTTP/1.1 403 Forbidden</D:status>
    </D:propstat>
  </D:response>
</D:multistatus>`;
    res.status(207);
    res.set('Content-Type', 'application/xml; charset="utf-8"');
    res.send(body);
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
                    res.set('Allow', 'OPTIONS, PROPFIND, PROPPATCH, MKCOL, GET, HEAD, PUT, DELETE, COPY, MOVE, LOCK, UNLOCK');
                    res.status(200).end();
                    return;
                case 'PROPFIND':
                    await handlePropfind(req, res, username, segments, pathInfo);
                    return;
                case 'PROPPATCH':
                    await handleProppatch(req, res, username, segments, pathInfo);
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
                case 'LOCK':
                    await handleLock(req, res, username, segments);
                    return;
                case 'UNLOCK':
                    await handleUnlock(req, res, username, segments);
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
                    res.status(405).set('Allow', 'OPTIONS, PROPFIND, PROPPATCH, MKCOL, GET, HEAD, PUT, DELETE, COPY, MOVE, LOCK, UNLOCK').send('Method Not Allowed');
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
