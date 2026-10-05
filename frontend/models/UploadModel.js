// Shared upload logic. Large files are split into chunks so no single request exceeds
// reverse-proxy upload limits (e.g. Cloudflare's 100 MB cap on Free/Pro plans).

const CHUNKED_UPLOAD_THRESHOLD = 100 * 1024 * 1024; // 100 MB
const CHUNK_SIZE = 90 * 1024 * 1024; // 90 MB per request, safely under Cloudflare's 100 MB

function postBlob(url, blob, onProgress) {
    return new Promise(function (resolve, reject) {
        const xhr = new XMLHttpRequest();
        xhr.withCredentials = true;

        xhr.addEventListener('load', () => {
            if (xhr.status >= 200 && xhr.status < 300) resolve(xhr.response);
            else reject({ status: xhr.status, statusText: xhr.statusText, body: xhr.response });
        });

        xhr.addEventListener('error', () => {
            reject({ status: xhr.status, statusText: xhr.statusText, body: xhr.response, networkError: true });
        });

        if (onProgress) xhr.upload.addEventListener('progress', (event) => onProgress(event.loaded, event.total));

        xhr.open('POST', url);
        xhr.setRequestHeader('Content-Type', 'application/octet-stream');
        xhr.send(blob);
    });
}

// Upload a file to url. Files above CHUNKED_UPLOAD_THRESHOLD are sent as CHUNK_SIZE pieces with
// chunk/chunks query params. onProgress({ loaded, total }) reports cumulative bytes across chunks.
async function upload(url, file, { onProgress } = {}) {
    if (file.size <= CHUNKED_UPLOAD_THRESHOLD) {
        return await postBlob(url, file, onProgress ? (loaded, total) => onProgress({ loaded, total }) : null);
    }

    const chunks = Math.ceil(file.size / CHUNK_SIZE);
    const separator = url.includes('?') ? '&' : '?';

    for (let i = 0; i < chunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);
        const blob = file.slice(start, end);

        await postBlob(`${url}${separator}chunk=${i}&chunks=${chunks}`, blob, onProgress ? (loaded) => onProgress({ loaded: start + loaded, total: file.size }) : null);
    }
}

export default {
    upload
};
