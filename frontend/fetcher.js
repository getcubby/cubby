
const globalOptions = {
    credentials: 'same-origin'
};

async function get(uri, query = {}, options = {}) {
    let response, result;

    const url = new URL(uri);
    url.search = new URLSearchParams(query).toString();

    try {
        response = await fetch(url, {
            credentials: options.credentials || globalOptions.credentials
        });
        result = await response.json();
    } catch (e) {
        throw e;
    }

    return { status: response.status, body: result };
}

async function post(uri, body, query = {}, options = {}) {
    let response, result;

    const url = new URL(uri);
    url.search = new URLSearchParams(query).toString();

    try {
        response = await fetch(url, {
            credentials: options.credentials || globalOptions.credentials,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: body && JSON.stringify(body)
        });
        result = await response.json();
    } catch (e) {
        throw e;
    }

    return { status: response.status, body: result };
}

async function del(uri, query = {}, options = {}) {
    let response, result;

    const url = new URL(uri);
    url.search = new URLSearchParams(query).toString();

    try {
        response = await fetch(url, {
            method: 'DELETE',
            credentials: options.credentials || globalOptions.credentials
        });
        result = await response.json();
    } catch (e) {
        throw e;
    }

    return { status: response.status, body: result };
}

export default {
    globalOptions,
    get,
    post,
    del,
    delete: del
};
