import { DOMParser as Dom } from 'xmldom';
import xpath from 'xpath';
import settings from './settings.js';

const FETCH_TIMEOUT_MS = 5000;

const OFFICE_MANIFEST_IDS = new Set([
    'com.collaboraoffice.coudronapp',
    'com.onlyoffice.coudronapp',
    'com.onlyoffice_ee.coudronapp',
    'com.eurooffice.cloudronapp'
]);

function envOfficeOrigin() {
    return (process.env.OFFICE_ORIGIN || '').replace(/\/$/, '');
}

async function getWopiHost() {
    const fromEnv = envOfficeOrigin();
    if (fromEnv) return fromEnv;

    try {
        return await settings.getOfficeOrigin();
    } catch (error) {
        console.error('Failed to read office origin.', error);
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
    OFFICE_MANIFEST_IDS,
    envOfficeOrigin,
    getWopiHost,
    getSupportedExtensions
};
