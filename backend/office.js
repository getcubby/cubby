import constants from './constants.js';
import { DOMParser as Dom } from 'xmldom';
import xpath from 'xpath';

const APP_BRIDGE_ORIGIN = constants.CLOUDRON ? 'http://172.18.0.1:3006' : 'http://127.0.0.1:3001';

async function getWopiHost() {
    if (process.env.OFFICE_ORIGIN) return process.env.OFFICE_ORIGIN.replace(/\/$/, '');

    try {
        const res = await fetch(`${APP_BRIDGE_ORIGIN}/default-app/office`);
        if (!res.ok) throw new Error(`status ${res.status}`);
        const { domain } = await res.json();
        return domain ? `https://${domain}` : '';
    } catch (error) {
        if (error.message === 'status 404') return '';
        console.error('Failed to fetch default office app:', error);
        return '';
    }
}

async function getSupportedExtensions(wopiHost) {
    const res = await fetch(`${wopiHost}/hosting/discovery`);

    let extensions = [];

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

export default {
    getWopiHost,
    getSupportedExtensions
};
