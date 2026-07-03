import safe from '@cloudron/safetydance';

const GLOBS2_FILE = '/usr/share/mime/globs2';

var gTypes = null;

function init() {
    if (gTypes) return;

    console.log(`Loading rich mime-types from ${GLOBS2_FILE}`);

    gTypes = {};

    const glob2 = safe.fs.readFileSync(GLOBS2_FILE, 'utf8');
    if (glob2 === null) {
        console.log('Failed to load globs2 file. Using built-in media-types.', safe.error);
        return;
    }

    // we reverse the list to keep priorities correct
    glob2.split('\n').reverse().forEach(function (line) {
        if (line.startsWith('#')) return;

        var f = line.split(':');
        if (f.length <= 1) return;

        gTypes[f[2].slice(1)] = f[1];
    });
}

export default function (filePath) {
    if (!gTypes) init();

    const typeKey = Object.keys(gTypes).find(function (type) {
        return filePath.toLowerCase().endsWith(type);
    });

    if (!typeKey) return 'application/octet-stream';

    // ubuntu globs reports application/rtf but collabora wants the correct mimetype of text/rtf
    if (typeKey === '.rtf') return 'text/rtf';

    return gTypes[typeKey];
}
