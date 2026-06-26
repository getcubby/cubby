import assert from 'assert';
import debug from 'debug';
import files from './files.js';

const debugLog = debug('cubby:relocate');

async function relocate({ fromOwner, fromPath, toOwner, toPath }) {
    assert.strictEqual(typeof fromOwner, 'string');
    assert.strictEqual(typeof fromPath, 'string');
    assert.strictEqual(typeof toOwner, 'string');
    assert.strictEqual(typeof toPath, 'string');

    debugLog(`relocate: ${fromOwner}:${fromPath} -> ${toOwner}:${toPath}`);

    await files.move(fromOwner, fromPath, toOwner, toPath);

    // Metadata migration (shares, favorites, recent, storage_paths) added in later phases.
    await files.runChangeHooks(fromOwner, fromPath);
    await files.runChangeHooks(toOwner, toPath);
}

export default {
    relocate
};
