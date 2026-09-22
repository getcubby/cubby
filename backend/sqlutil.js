import assert from 'assert';
import files from './files.js';

// Maps an owner (a username or `groupfolder-<id>`) to the owner columns used
// across the data tables (shares, filedrops, favorites, recents, file_activity).
function ownerToDbColumns(owner) {
    assert.strictEqual(typeof owner, 'string');

    if (files.isGroupfolder(owner)) {
        return {
            ownerUsername: null,
            ownerGroupfolder: owner.slice('groupfolder-'.length)
        };
    }

    return {
        ownerUsername: owner,
        ownerGroupfolder: null
    };
}

// Builds a `file_path` equality / descendant-prefix predicate and its bound
// arguments. Uses a boundary-safe substr comparison (no LIKE wildcards) so
// paths containing `%` or `_` match literally.
function pathCondition(path, isDirectory) {
    assert.strictEqual(typeof path, 'string');
    assert.strictEqual(typeof isDirectory, 'boolean');

    if (!isDirectory) return { sql: 'file_path = ?', args: [ path ] };

    return {
        sql: '(file_path = ? OR substr(file_path, 1, length(?) + 1) = ? || \'/\')',
        args: [ path, path, path ]
    };
}

export default {
    ownerToDbColumns,
    pathCondition
};
