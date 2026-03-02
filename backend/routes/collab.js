import debug from 'debug';
import files from '../files.js';
import MainError from '../mainerror.js';
import { HttpError, HttpSuccess } from 'connect-lastmile';
import * as yUtils from '@y/websocket-server/utils';

const debugLog = debug('cubby:routes:collab');

const FRAGEMENT_NAME = 'cubby-markdownviewer';

// set noop persistence for now. This will ensure docs without connections are purged from memory
// https://github.com/yjs/y-websocket/blob/master/bin/utils.cjs#L223
yUtils.setPersistence({
    provider: 'cubbyPersistence',
    bindState: async (docName, ydoc) => {},
    writeState: async (_docName, _ydoc) => {}
});

function setupWSConnection() {
    return yUtils.setupWSConnection;
}

async function getHandle(req, res, next) {
    const filePath = req.query.path;
    if (!filePath) return next(new HttpError(400, 'path must be a non-empty string'));

    const subject = await files.translateResourcePath(req.user.username, filePath);
    if (!subject) return next(new HttpError(403, 'not allowed'));

    debugLog(`getHandle: ${subject.resource} ${subject.filePath}`);

    const entry = files.get(subject.usernameOrGroupfolder, subject.filePath);
    if (!entry) return next(new HttpError(400, 'invalid '));

    let result;
    try {
        result = await files.get(subject.usernameOrGroupfolder, subject.filePath);
    } catch (error) {
        if (error.reason === MainError.NOT_FOUND) return next(new HttpError(404, 'not found'));
        return next(new HttpError(500, error));
    }

    if (!result.isFile) return next(new HttpError(400, 'type not supported'));

    const doc = yUtils.getYDoc(result.id);

    if (doc.share.has(FRAGEMENT_NAME)) {
        debugLog(`getHandle: existing ydoc reused ${result.id}`);
        next(new HttpSuccess(200, { id: result.id, fragmentName: FRAGEMENT_NAME }));
    } else {
        debugLog(`getHandle: new ydoc created ${result.id}`);
        next(new HttpSuccess(201, { id: result.id, fragmentName: FRAGEMENT_NAME }));
    }
}

export default {
    setupWSConnection,
    getHandle
};
