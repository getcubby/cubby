exports = module.exports = {
    getHandle
};

const debug = require('debug')('cubby:routes:collab'),
    HttpSuccess = require('connect-lastmile').HttpSuccess,
    yUtils = require('y-websocket/bin/utils');

const FRAGEMENT_NAME = 'cubby-markdownviewer';

async function getHandle(req, res, next) {
    const id = req.params.id;

    debug(`getHandle: ${id}`);

    const doc = yUtils.getYDoc(id);

    if (doc.share.has(FRAGEMENT_NAME)) {
        debug('getHandle: existing ydoc reused');
        next(new HttpSuccess(200, { id, fragmentName: FRAGEMENT_NAME }));
    } else {
        debug('getHandle: new ydoc created');
        next(new HttpSuccess(201, { id, fragmentName: FRAGEMENT_NAME }));
    }
}
