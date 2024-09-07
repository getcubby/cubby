'use strict';

const assert = require('assert'),
    mimeIcons = require('./mimeicons.js'),
    crypto = require('crypto'),
    isBinaryFileSync = require('isbinaryfile').isBinaryFileSync,
    preview = require('./preview.js');

exports = module.exports = Entry;

function Entry({ fullFilePath, filePath, fileName, owner, size = 0, mtime = new Date(), isDirectory, isFile, isShare = false, isGroup = false, mimeType, files = [], sharedWith = [], share = null, group = null }) {
    assert(fullFilePath && typeof fullFilePath === 'string');
    assert(filePath && typeof filePath === 'string');
    assert(owner && typeof owner === 'string');
    assert(typeof fileName === 'string');
    assert.strictEqual(typeof size, 'number');
    assert(mtime instanceof Date && !isNaN(mtime.valueOf()));
    assert.strictEqual(typeof isFile, 'boolean');
    assert.strictEqual(typeof isDirectory, 'boolean');
    assert.strictEqual(typeof isShare, 'boolean');
    assert.strictEqual(typeof isGroup, 'boolean');
    assert(mimeType && typeof mimeType === 'string');
    assert(Array.isArray(sharedWith));
    assert.strictEqual(typeof share, 'object');
    assert.strictEqual(typeof group, 'object');

    // TODO check that files is an array of Entries

    this._fullFilePath = fullFilePath;
    this.fileName = fileName;
    this.filePath = filePath;
    this.owner = owner;
    this.size = size;
    this.mtime = mtime;
    this.isDirectory = isDirectory;
    this.isFile = isFile;
    this.isBinary = isFile ? isBinaryFileSync(fullFilePath) : false;
    this.mimeType = mimeType;
    this.files = files;
    this.sharedWith = sharedWith;
    this.isShare = isShare;     // true if virtual toplevel share item or the actual shared file/folder
    this.share = share;         // contains the share info of the share this item belongs to if any
    this.isGroup = isGroup;     // true if virtual toplevel group item or the actual group file/folder
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
    if (!this.mimeType) return '/mime-types/application-octet-stream.svg';
    if (this.mimeType === 'inode/recent') return '/folder-temp.svg';
    if (this.mimeType === 'inode/share') return '/folder-network.svg';

    const previewHash = preview.getHash(this.mimeType, this._fullFilePath);
    if (previewHash) {
        let type;
        if (this.share) type = 'shares';
        else if (this.group) type = 'groups';
        else type = 'files';

        let ownerId;
        if (this.share) ownerId = this.share.id;
        else if (this.group) ownerId = this.group.id;
        else ownerId = this.owner;

        return `/api/v1/preview/${type}/${ownerId}/${previewHash}`;
    }

    const mime = this.mimeType.split('/');

    if (mimeIcons[mime[0] + '-' + mime[1]]) return '/mime-types/' + mime[0] + '-' + mime[1] + '.svg';
    if (mimeIcons[mime[0] + '-x-generic']) return '/mime-types/' + mime[0] + '-x-generic.svg';

    return '/mime-types/application-octet-stream.svg';
};

Entry.prototype.withoutPrivate = function () {
    return {
        id: this.id || crypto.createHash('sha1').update(this.owner + this.filePath).digest('base64'),
        fileName: this.fileName,
        filePath: this.filePath,
        owner: this.owner,
        size: this.size,
        mtime: this.mtime,
        isDirectory: this.isDirectory,
        isFile: this.isFile,
        isShare: this.isShare,
        isGroup: this.isGroup,
        isBinary: this.isBinary,
        mimeType: this.mimeType,
        files: this.files.map(function (f) { return f.withoutPrivate(); }),
        share: this.share,
        group: this.group,
        sharedWith: this.sharedWith || [],
        previewUrl: this.getPreviewUrl()
    };
};
