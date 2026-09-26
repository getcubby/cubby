import assert from 'assert';
import mimeIcons from './mimeicons.js';
import crypto from 'crypto';
import path from 'path';
import paths from './paths.js';
import preview from './preview.js';

function Entry({ fullFilePath, filePath, fileName, owner, size = 0, mtime = new Date(), atime = new Date(), isDirectory, isFile, isShare = false, isGroup = false, isBinary = false, mimeType, files = [], sharedWith = [], fileDrops = [], share = null, group = null, favorites = null }) {
    assert(fullFilePath && typeof fullFilePath === 'string');
    assert(filePath && typeof filePath === 'string');
    assert(owner && typeof owner === 'string');
    assert(typeof fileName === 'string');
    assert.strictEqual(typeof size, 'number');
    assert(mtime instanceof Date && !isNaN(mtime.valueOf()));
    assert(atime instanceof Date && !isNaN(atime.valueOf()));
    assert.strictEqual(typeof isFile, 'boolean');
    assert.strictEqual(typeof isDirectory, 'boolean');
    assert.strictEqual(typeof isShare, 'boolean');
    assert.strictEqual(typeof isGroup, 'boolean');
    assert.strictEqual(typeof isBinary, 'boolean');
    assert(mimeType && typeof mimeType === 'string');
    assert(Array.isArray(sharedWith));
    assert(Array.isArray(fileDrops));
    assert.strictEqual(typeof share, 'object');
    assert.strictEqual(typeof group, 'object');
    assert.strictEqual(typeof favorites, 'object');

    // TODO check that files is an array of Entries

    this.id = crypto.createHash('sha1').update(owner + filePath).digest('base64');
    this._fullFilePath = fullFilePath;
    this.fileName = fileName;
    this.filePath = filePath;
    this.owner = owner;
    this.size = size;
    this.mtime = mtime;
    this.atime = atime;
    this.isDirectory = isDirectory;
    this.isFile = isFile;
    this.favorites = favorites;
    this.mimeType = mimeType;
    this.files = files;
    this.sharedWith = sharedWith;
    this.fileDrops = fileDrops;
    this.isShare = isShare;     // true if virtual toplevel share item or the actual shared file/folder
    this.share = share;         // contains the share info of the share this item belongs to if any
    this.isGroup = isGroup;     // true if virtual toplevel group item or the actual group file/folder
    this.isBinary = isBinary;   // true if the file content is binary (not text)
    this.group = group;         // contains the group info of the group this item belongs to if any
}

Entry.prototype.asShare = function (shareFilePath) {
    var result = this;

    result.files = result.files.map(function (f) { return f.asShare(shareFilePath); });
    result.filePath = result.filePath.slice(shareFilePath.length) || '/';

    // don't leak info
    result.sharedWith = [];

    return result;
};

Entry.prototype.asGroup = function () {
    var result = this;

    // result.files = result.files.map(function (f) { return f.asGroup(groupFilePath); });
    // result.filePath = result.filePath.slice(groupFilePath.length) || '/';

    return result;
};

Entry.prototype.getPreviewUrl = function () {
    if (!this.mimeType) return '/mime-types/application-x-generic.svg';
    if (this.mimeType === 'inode/recent') return '/folder-temp.svg';
    if (this.mimeType === 'inode/share') return '/folder-network.svg';

    const previewHash = preview.getHash(this.mimeType, this._fullFilePath);
    if (previewHash) {
        let type, ownerId, rootPath;
        if (this.share) {
            type = 'shares';
            ownerId = this.share.id;
            const ownerRoot = this.share.ownerGroupfolder ? path.join(paths.GROUPS_DATA_ROOT, this.share.ownerGroupfolder) : path.join(paths.USER_DATA_ROOT, this.share.ownerUsername);
            rootPath = path.join(ownerRoot, this.share.filePath);
        } else if (this.group) {
            type = 'groups';
            ownerId = this.group.id;
            rootPath = path.join(paths.GROUPS_DATA_ROOT, this.group.id);
        } else {
            type = 'files';
            ownerId = this.owner;
            rootPath = path.join(paths.USER_DATA_ROOT, this.owner);
        }

        // path is relative to the share, group folder or home, the preview route resolves it to check access
        const relativePath = '/' + path.relative(rootPath, this._fullFilePath);
        // also escape characters that break unquoted css url()
        const encodedPath = encodeURIComponent(relativePath).replace(/[()'!*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());

        return `/api/v1/preview/${type}/${ownerId}/${previewHash}?path=${encodedPath}`;
    }

    const mime = this.mimeType.split('/');

    if (mimeIcons[mime[0] + '-' + mime[1]]) return '/mime-types/' + mimeIcons[mime[0] + '-' + mime[1]];
    if (mimeIcons[mime[0] + '-x-generic']) return '/mime-types/' + mimeIcons[mime[0] + '-x-generic'];

    return '/mime-types/application-x-generic.svg';
};

Entry.prototype.withoutPrivate = function (username = null) {
    return {
        id: this.id,
        fileName: this.fileName,
        filePath: this.filePath,
        owner: this.owner,
        size: this.size,
        mtime: this.mtime,
        atime: this.atime,
        isDirectory: this.isDirectory,
        isFile: this.isFile,
        isShare: this.isShare,
        isGroup: this.isGroup,
        isBinary: this.isBinary,
        mimeType: this.mimeType,
        favorite: username ? this.favorites.find(f => f.username === username) : null,
        files: this.files.map(function (f) { return f.withoutPrivate(username); }),
        share: this.share,
        group: this.group,
        sharedWith: this.sharedWith || [],
        fileDrops: this.fileDrops || [],
        previewUrl: this.getPreviewUrl()
    };
};

export default Entry;
