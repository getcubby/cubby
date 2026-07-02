import assert from 'assert';
import debug from 'debug';
import files from './files.js';
import shares from './shares.js';
import favorites from './favorites.js';
import recent from './recent.js';
import activity from './activity.js';

const debugLog = debug('cubby:relocate');

function storageToResourcePrefix(owner, filePath) {
    if (owner.indexOf('groupfolder-') === 0) {
        const groupId = owner.slice('groupfolder-'.length);
        return `/groupfolders/${groupId}${filePath}`;
    }

    return `/home${filePath}`;
}

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

    await favorites.relocatePaths({ fromOwner, fromPath, toOwner, toPath, isDirectory });

    await recent.relocateResourcePaths({
        fromResourcePrefix: storageToResourcePrefix(fromOwner, fromPath),
        toResourcePrefix: storageToResourcePrefix(toOwner, toPath),
        isDirectory
    });

    await activity.relocatePaths({ fromOwner, fromPath, toOwner, toPath, isDirectory });

    await files.runChangeHooks(fromOwner, fromPath);
    await files.runChangeHooks(toOwner, toPath);
}

export default {
    relocate
};
