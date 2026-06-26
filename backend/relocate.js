import assert from 'assert';
import debug from 'debug';
import files from './files.js';
import shares from './shares.js';

const debugLog = debug('cubby:relocate');

async function relocate({ fromOwner, fromPath, toOwner, toPath }) {
    assert.strictEqual(typeof fromOwner, 'string');
    assert.strictEqual(typeof fromPath, 'string');
    assert.strictEqual(typeof toOwner, 'string');
    assert.strictEqual(typeof toPath, 'string');

    debugLog(`relocate: ${fromOwner}:${fromPath} -> ${toOwner}:${toPath}`);

    const entry = await files.get(fromOwner, fromPath);
    const isDirectory = entry.isDirectory;

    await files.move(fromOwner, fromPath, toOwner, toPath);

    await shares.relocatePaths({ fromOwner, fromPath, toOwner, toPath, isDirectory });

    // favorites, recent, storage_paths added in later phases.
    await files.runChangeHooks(fromOwner, fromPath);
    await files.runChangeHooks(toOwner, toPath);
}

export default {
    relocate
};
