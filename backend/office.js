import { DOMParser as Dom } from 'xmldom';
import xpath from 'xpath';
import { appBridge } from '@cloudron/tegel';

const FETCH_TIMEOUT_MS = 5000;

async function getWopiHost() {
    try {
        const { domain } = await appBridge.getDefaultApp('office');
        return domain ? `https://${domain}` : '';
    } catch (error) {
        if (error.status === 404) return '';
        console.error('Failed to fetch default office app:', error);
        return '';
    }
}

async function getSupportedExtensions(wopiHost) {
    const res = await fetch(`${wopiHost}/hosting/discovery`, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });

    let extensions = [];

    const doc = new Dom().parseFromString(await res.text());
    if (doc) {
        const nodes = xpath.select('/wopi-discovery/net-zone/app/action', doc);
        if (nodes) {
            // better handle with other viewers
            const filteredExtensions = [ 'txt', 'key', 'svg', 'bmp', 'png', 'gif', 'tiff', 'jpg', 'jpeg' ];
            extensions = nodes.map(function (n) { return n.getAttribute('ext'); }).filter(function (e) { return !!e; }).filter((e) => filteredExtensions.indexOf(e) === -1);
        }

        console.log(`Supported office extensions on ${wopiHost}:`, extensions);
    }

    return extensions;
}

export default {
    getWopiHost,
    getSupportedExtensions
};
