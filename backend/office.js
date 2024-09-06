exports = module.exports = {
    getSupportedExtensions
};

const Dom = require('xmldom').DOMParser,
    xpath = require('xpath');

async function getSupportedExtensions(wopiHost) {
    const res = await fetch(`${wopiHost}/hosting/discovery`);

    const doc = new Dom().parseFromString(await res.text());
    if (doc) {
        const nodes = xpath.select('/wopi-discovery/net-zone/app/action', doc);
        if (nodes) {
            // better handle with other viewers
            const filteredExtensions = [ 'txt', 'key', 'svg', 'bmp', 'png', 'gif', 'tiff', 'jpg', 'jpeg', 'pdf' ];
            extensions = nodes.map(function (n) { return n.getAttribute('ext'); }).filter(function (e) { return !!e; }).filter((e) => filteredExtensions.indexOf(e) === -1);
        }

        console.log(`Supported office extensions on ${wopiHost}:`, extensions);
    }

    return extensions;
}
