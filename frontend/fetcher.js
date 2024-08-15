
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
        result = await response.json();
    } catch (e) {
        throw e;
    }

    return { status: response.status, body: result };
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
    get,
    post,
    put,
    del,
    delete: del
};
