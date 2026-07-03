import assert from 'assert';
import debug from 'debug';
import files from './files.js';
import shares from './shares.js';
import favorites from './favorites.js';
import recent from './recent.js';
import activity from './activity.js';

const debugLog = debug('cubby:relocate');

async function relocate({ actor, fromOwner, fromPath, toOwner, toPath }) {
    assert.strictEqual(typeof fromOwner, 'string');
    assert.strictEqual(typeof fromPath, 'string');
    assert.strictEqual(typeof toOwner, 'string');
    assert.strictEqual(typeof toPath, 'string');
    assert(actor === undefined || typeof actor === 'string');

    debugLog(`relocate: ${fromOwner}:${fromPath} -> ${toOwner}:${toPath}`);

    const entry = await files.get(fromOwner, fromPath);
    const isDirectory = entry.isDirectory;

    await files.move(fromOwner, fromPath, toOwner, toPath);

    await shares.relocatePaths({ fromOwner, fromPath, toOwner, toPath, isDirectory });

    await favorites.relocatePaths({ fromOwner, fromPath, toOwner, toPath, isDirectory });

    await recent.relocatePaths({ fromOwner, fromPath, toOwner, toPath, isDirectory });

    await activity.relocatePaths({ fromOwner, fromPath, toOwner, toPath, isDirectory });

    await files.runChangeHooks(fromOwner, fromPath);
    await files.runChangeHooks(toOwner, toPath, actor ? { actor, action: 'moved', details: { fromOwner, fromPath, toOwner, toPath } } : null);
}

export default {
    relocate
};
