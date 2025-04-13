exports = module.exports = {
    getHandle
};

const debug = require('debug')('cubby:routes:collab'),
    files = require('../files.js'),
    MainError = require('../mainerror.js'),
    HttpError = require('connect-lastmile').HttpError,
    HttpSuccess = require('connect-lastmile').HttpSuccess,
    translateResourcePath = require('./files.js').translateResourcePath,
    yUtils = require('@y/websocket-server/utils');

const FRAGEMENT_NAME = 'cubby-markdownviewer';

// set noop persistence for now. This will ensure docs without connections are purged from memory
// https://github.com/yjs/y-websocket/blob/master/bin/utils.cjs#L223
yUtils.setPersistence({
    provider: 'cubbyPersistence',
    bindState: async (docName, ydoc) => {},
    writeState: async (_docName, _ydoc) => {}
});

async function getHandle(req, res, next) {
    const filePath = req.query.path;
    if (!filePath) return next(new HttpError(400, 'path must be a non-empty string'));

    const subject = await translateResourcePath(req.user, filePath);
    if (!subject) return next(new HttpError(403, 'not allowed'));

    debug(`getHandle: ${subject.resource} ${subject.filePath}`);

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
        debug(`getHandle: existing ydoc reused ${result.id}`);
        next(new HttpSuccess(200, { id: result.id, fragmentName: FRAGEMENT_NAME }));
    } else {
        debug(`getHandle: new ydoc created ${result.id}`);
        next(new HttpSuccess(201, { id: result.id, fragmentName: FRAGEMENT_NAME }));
    }
}
