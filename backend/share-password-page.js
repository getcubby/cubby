function escapeHtml(text) {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Minimal standalone page used for password protected raw/download share links.
function renderPasswordPage({ shareId, returnTo, error }) {
    const action = `/api/v1/shares/${escapeHtml(shareId)}/unlock`;
    const returnToInput = returnTo ? `<input type="hidden" name="returnTo" value="${escapeHtml(returnTo)}" />` : '';
    const errorHtml = error ? `<p class="error">${escapeHtml(error)}</p>` : '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="user-scalable=no, initial-scale=1, maximum-scale=1, minimum-scale=1, width=device-width, height=device-height" />
    <title>Cubby - Password required</title>
    <style>
        @media (prefers-color-scheme: dark) { body { background-color: black; color: #eee; } }
        body { font-family: Inter, system-ui, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
        .box { width: 100%; max-width: 360px; padding: 32px; text-align: center; }
        h1 { font-size: 22px; }
        form { display: flex; flex-direction: column; gap: 12px; margin-top: 16px; }
        input[type="password"] { padding: 10px 12px; font-size: 15px; border: 1px solid #ccc; border-radius: 6px; }
        button { padding: 10px 12px; font-size: 15px; border: 0; border-radius: 6px; background: #2f6fed; color: white; cursor: pointer; }
        .error { color: #d33; margin: 0; }
    </style>
</head>
<body>
    <div class="box">
        <h1>This share is protected</h1>
        <p>Enter the password to access this share.</p>
        ${errorHtml}
        <form method="post" action="${action}">
            ${returnToInput}
            <input type="password" name="password" placeholder="Password" autofocus />
            <button type="submit">Continue</button>
        </form>
    </div>
</body>
</html>`;
}

export default {
    renderPasswordPage
};
