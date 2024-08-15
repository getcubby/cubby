
const globalOptions = {
    credentials: 'same-origin'
};

async function request(uri, method, headers, query, body, options) {
    let response, result;

    const url = new URL(uri);
    url.search = new URLSearchParams(query).toString();

    const fetchOptions = {
        method,
        headers,
        credentials: options.credentials || globalOptions.credentials
    };

    if (body) fetchOptions.body = JSON.stringify(body);

    try {
        response = await fetch(url, fetchOptions);
        if (!response.ok) {
            const error = new Error(await response.text());
            error.status = response.status;
            throw error;
        }

        const headers = response.headers;
        const contentType = headers.get('Content-Type');

        if (method === 'HEAD') {
            result = '';
        } else {
            if (contentType.indexOf('application/json') !== -1) {
                try {
                    result = await response.json();
                } catch (e) {
                    throw new Error(`Failed to parse response as json for content type ${contentType}.`, e);
                }
            } else {
                result = await response.text();
            }
        }
    } catch (e) {
        throw e;
    }

    return { status: response.status, body: result };
}

async function head(uri, query = {}, options = {}) {
    return await request(uri, 'HEAD', {}, query, null, options);
}

async function get(uri, query = {}, options = {}) {
    return await request(uri, 'GET', {}, query, null, options);
}

async function post(uri, body, query = {}, options = {}) {
    return await request(uri, 'POST', { 'Content-Type': 'application/json' }, query, body, options);
}

async function put(uri, body, query = {}, options = {}) {
    return await request(uri, 'PUT', { 'Content-Type': 'application/json' }, query, body, options);
}

async function del(uri, query = {}, options = {}) {
    return await request(uri, 'DELETE', {}, query, null, options);
}

export default {
    globalOptions,
    head,
    get,
    post,
    put,
    del,
    delete: del
};
