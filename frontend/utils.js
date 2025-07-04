
const API_ORIGIN = import.meta.env.VITE_API_ORIGIN ? import.meta.env.VITE_API_ORIGIN : '';
const BASE_URL = import.meta.env.BASE_URL || '/';

function sanitize(path) {
    path = '/' + path;
    return path.replace(/\/+/g, '/');
}

// TODO create share links instead of using access token
function getDirectLink(entry) {
    if (entry.share) {
        let link = window.location.origin + '/api/v1/shares/' + entry.share.id + '?type=raw&path=' + encodeURIComponent(entry.filePath);
        return link;
    } else if (entry.group) {
        let link = window.location.origin + '/api/v1/group/' + entry.group.id + '?type=raw&path=' + encodeURIComponent(entry.filePath);
        return link;
    } else {
        return window.location.origin + '/api/v1/files?type=raw&path=' + encodeURIComponent(entry.filePath);
    }
}

// TODO the url might actually return a 412 in which case we have to keep reloading
function getPreviewUrl(entry) {
    if (!entry.previewUrl) return '';
    return entry.previewUrl;
}

function getFileTypeGroup(entry) {
    return entry.mimeType.split('/')[0];
}

// simple extension detection, does not work with double extension like .tar.gz
function getExtension(entry) {
    if (entry.isFile) return entry.fileName.slice(entry.fileName.lastIndexOf('.') + 1);
    return '';
}

function copyToClipboard(value) {
    var elem = document.createElement('input');
    elem.value = value;
    document.body.append(elem);
    elem.select();
    document.execCommand('copy');
    elem.remove();
}

function urlSearchQuery() {
    return decodeURIComponent(window.location.search).slice(1).split('&').map(function (item) { return item.split('='); }).reduce(function (o, k) { o[k[0]] = k[1]; return o; }, {});
}

// those paths contain the internal type and path reference eg. shares/:shareId/folder/filename or files/folder/filename
function parseResourcePath(resourcePath) {
    var result = {
        type: '',
        path: '',
        parentResourcePath: '',
        shareId: '',
        groupId: '',
        id: '',
        resourcePath: ''
    };

    if (resourcePath.indexOf('/home/') === 0) {
        result.type = 'home';
        result.path = resourcePath.slice('/home'.length) || '/';
        result.parentResourcePath = result.path === '/' ? null : '/home' + result.path.slice(0, result.path.lastIndexOf('/')) + '/';
        result.id = 'home';
        result.resourcePath = `/${result.type}${result.path}`;
    } else if (resourcePath.indexOf('/recent/') === 0) {
        result.type = 'recent';
        result.path = resourcePath.slice('/recent'.length) || '/';
        result.parentResourcePath = result.path === '/' ? null : '/recent' + result.path.slice(0, result.path.lastIndexOf('/')) + '/';
        result.id = 'recent';
        result.resourcePath = `/${result.type}${result.path}`;
    } else if (resourcePath.indexOf('/shares/') === 0) {
        result.type = 'shares';
        result.shareId = resourcePath.split('/')[2];
        result.path = resourcePath.slice(('/' + result.type + '/' + result.shareId).length) || '/';
        // parent could be parten folder inside share or  the virutal shares folder
        if (!result.shareId || result.path === '/') {
            result.parentResourcePath = '/shares/';
        } else {
            const oneFolderUp = result.path.slice(0, result.path.lastIndexOf('/'));
            result.parentResourcePath = `/shares/${result.shareId}${oneFolderUp}/`;
        }
        result.id = 'shares';
        // without shareId we show the root (share listing)
        result.resourcePath = `/${result.type}/` + (result.shareId ? (result.shareId + result.path) : '');
    } else if (resourcePath.indexOf('/groupfolders/') === 0) {
        result.type = 'groupfolders';
        result.groupId = resourcePath.split('/')[2];
        result.path = resourcePath.slice(('/' + result.type + '/' + result.groupId).length) || '/';
        // parent could be parent folder inside share or  the virtual groupfolders
        if (!result.groupId || result.path === '/') {
            result.parentResourcePath = '/groupfolders/';
        } else {
            const oneFolderUp = result.path.slice(0, result.path.lastIndexOf('/'));
            result.parentResourcePath = `/groupfolders/${result.groupId}${oneFolderUp}/`;
        }
        result.id = 'groupfolders';
        // without groupId we show the root (share listing)
        result.resourcePath = `/${result.type}/` + (result.groupId ? (result.groupId + result.path) : '');
    } else {
        console.error('Unknown resource path', resourcePath);
    }

    return result;
}

function prettyType(entry) {
    if (!entry || !entry.mimeType) return '';
    if (entry.mimeType === 'application/octet-stream') return 'unknown';
    return entry.mimeType.split('/')[1];
}

function getEntryIdentifier(entry) {
    if (entry.share) return `${entry.share.id}/${entry.filePath}`;
    else if (entry.group) return `${entry.group.id}/${entry.filePath}`;
    else return entry.filePath;
}

function entryListSort(list, prop, desc) {
    var tmp = list.sort(function (a, b) {
        var av = a[prop];
        var bv = b[prop];

        if (typeof av === 'string') return (av.toUpperCase() < bv.toUpperCase()) ? -1 : 1;
        else return (av < bv) ? -1 : 1;
    });

    if (desc) return tmp;
    return tmp.reverse();
}

export {
    API_ORIGIN,
    BASE_URL,
    getDirectLink,
    getPreviewUrl,
    getFileTypeGroup,
    sanitize,
    getExtension,
    copyToClipboard,
    urlSearchQuery,
    parseResourcePath,
    prettyType,
    getEntryIdentifier,
    entryListSort
};
