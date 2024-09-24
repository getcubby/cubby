const constants = require('./constants.js'),
    cors = require('./cors.js'),
    express = require('express'),
    files = require('./routes/files.js'),
    fs = require('fs'),
    groupFolders = require('./routes/groupfolders.js'),
    http = require('http'),
    lastMile = require('connect-lastmile'),
    misc = require('./routes/misc.js'),
    office = require('./routes/office.js'),
    oidc = require('express-openid-connect'),
    path = require('path'),
    session = require('express-session'),
    shares = require('./routes/shares.js'),
    users = require('./routes/users.js'),
    webdav = require('./routes/webdav.js'),
    ws = require('ws'),
    yUtils = require('y-websocket/bin/utils');

exports = module.exports = {
    init
};

const PORT = process.env.PORT || 3000;
const APP_ORIGIN = process.env.APP_ORIGIN || `http://localhost:${PORT}`;

function init(callback) {
    var app = express();

    var router = new express.Router();

    app.set('json spaces', 2); // pretty json

    const FileStore = require('session-file-store')(session);

    const sessionOptions = {
        store: new FileStore({ path: constants.SESSION_PATH }),
        secret: fs.readFileSync(constants.SESSION_SECRET_FILE_PATH, 'utf8'),
        resave: false,
        saveUninitialized: false,
        cookie: {
            maxAge: 1000 * 60 * 60 * 24 * 7 // one week
        }
    };

    // assume APP_ORIGIN is set if deployed
    if (process.env.APP_ORIGIN) {
        app.enable('trust proxy');
        sessionOptions.cookie.secure = true;
    }

    // currently for local development. vite runs on http://localhost:5173
    app.use(cors({ origins: [ '*' ], allowCredentials: true }));

    app.use(session(sessionOptions));

    router.del = router.delete; // amend router.del for readability further on

    function oidcLogin(req, res) {
        res.oidc.login({
            returnTo: '/',
            authorizationParams: {
                redirect_uri: `${APP_ORIGIN}/api/v1/callback`,
            }
        });
    }

    router.get ('/api/v1/profile', users.isAuthenticated, users.profile);
    router.get ('/api/v1/config', users.isAuthenticated, misc.getConfig);

    router.get ('/api/v1/settings/office', users.isAuthenticated, users.isAdmin, office.getSettings);
    router.put ('/api/v1/settings/office', users.isAuthenticated, users.isAdmin, office.setSettings);

    router.post('/api/v1/settings/groupfolders', users.isAuthenticated, users.isAdmin, groupFolders.add);
    router.get ('/api/v1/settings/groupfolders', users.isAuthenticated, users.isAdmin, groupFolders.list);
    router.get ('/api/v1/settings/groupfolders/:id', users.isAuthenticated, users.isAdmin, groupFolders.get);
    router.put ('/api/v1/settings/groupfolders/:id', users.isAuthenticated, users.isAdmin, groupFolders.update);
    router.del ('/api/v1/settings/groupfolders/:id', users.isAuthenticated, users.isAdmin, groupFolders.remove);

    router.get ('/api/v1/oidc/login', oidcLogin);

    router.get ('/api/v1/users', users.isAuthenticated, users.list);
    router.put ('/api/v1/users', users.isAuthenticated, users.update); // sets webdav password

    // user edit for admins
    router.put ('/api/v1/users/:username/admin', users.isAuthenticated, users.isAdmin, users.setAdmin);

    router.head('/api/v1/files', users.optionalSessionAuth, files.head);
    router.get ('/api/v1/files', users.optionalSessionAuth, files.get);
    router.post('/api/v1/files', users.optionalSessionAuth, files.add);
    router.put ('/api/v1/files', users.optionalSessionAuth, files.update);
    router.del ('/api/v1/files', users.optionalSessionAuth, files.remove);

    router.get ('/api/v1/shares', users.isAuthenticated, shares.listShares);
    router.post('/api/v1/shares', users.isAuthenticated, shares.createShare);
    router.del ('/api/v1/shares', users.isAuthenticated, shares.removeShare);

    // this is for share links
    router.get ('/api/v1/shares/:id', users.optionalSessionAuth, shares.attachReceiver, shares.getShareLink);

    router.get ('/api/v1/preview/:type/:id/:hash', users.optionalSessionAuth, shares.optionalAttachReceiver, misc.getPreview);

    router.get ('/api/v1/download', users.isAuthenticated, misc.download);

    router.get ('/api/v1/office/handle', users.isAuthenticated, office.getHandle);
    router.get ('/api/v1/office/wopi/files/:handleId', users.tokenAuth, office.checkFileInfo);
    router.get ('/api/v1/office/wopi/files/:handleId/contents', users.tokenAuth, office.getFile);
    router.post('/api/v1/office/wopi/files/:handleId/contents', users.tokenAuth, express.raw(), office.putFile);

    app.use('/api/healthcheck', function (req, res) { res.status(200).send(); });
    app.use('/api', express.json());
    app.use('/api', express.urlencoded({ extended: false, limit: '100mb' }));
    app.use(webdav.express());

    if (process.env.OIDC_ISSUER_BASE_URL) {
        app.use(oidc.auth({
            issuerBaseURL: process.env.OIDC_ISSUER_BASE_URL,
            baseURL: process.env.APP_ORIGIN,
            clientID: process.env.OIDC_CLIENT_ID,
            clientSecret: process.env.OIDC_CLIENT_SECRET,
            secret: 'oidc-' + fs.readFileSync(constants.SESSION_SECRET_FILE_PATH, 'utf8'),
            authorizationParams: {
                response_type: 'code',
                scope: 'openid profile email'
            },
            authRequired: false,
            routes: {
                callback: '/api/v1/callback',
                login: false,
                logout: '/api/v1/logout'
            },
            session: {
                name: 'CubbySession',
                rolling: true,
                rollingDuration: 24 * 60 * 60 * 4 // max 4 days idling
            },
        }));
    } else {
        // mock oidc
        app.use((req, res, next) => {
            res.oidc = {
                login(options) {
                    res.writeHead(200, { 'Content-Type': 'text/html' });
                    res.write(require('fs').readFileSync(__dirname + '/oidc_develop_user_select.html', 'utf8').replaceAll('REDIRECT_URI', options.authorizationParams.redirect_uri));
                    res.end();
                }
            };

            req.oidc = {
                user: {},
                isAuthenticated() {
                    return !!req.session.username;
                }
            };

            if (req.session.username) {
                req.oidc.user = {
                    sub: req.session.username,
                    family_name: 'Cubby',
                    given_name: req.session.username.toUpperCase(),
                    locale: 'en-US',
                    name: req.session.username.toUpperCase() + ' Cubby',
                    preferred_username: req.session.username,
                    email: req.session.username + '@cloudron.local',
                    email_verified: true
                };
            }

            next();
        });

        app.use('/api/v1/callback', (req, res) => {
            req.session.username = req.query.username;
            res.redirect(`http://localhost:${process.env.VITE_DEV_PORT || process.env.PORT}/`);
        });

        app.use('/api/v1/logout', (req, res) => {
            req.session.username = null;
            res.status(200).send({});
        });
    }

    app.use(router);
    app.use('/', express.static(path.resolve(__dirname, '../frontend-dist')));

    app.use(lastMile());

    const httpServer = http.createServer({ headersTimeout: 0, requestTimeout: 0 }, app);
    const wsServer = new ws.Server({ noServer: true });

    wsServer.on('connection', yUtils.setupWSConnection);

    httpServer.on('upgrade', (request, socket, head) => {
        console.log('TODO: add websocket auth!');

        // You may check auth of request here..
        // Call `wsServer.HandleUpgrade` *after* you checked whether the client has access
        // (e.g. by checking cookies, or url parameters).
        // See https://github.com/websockets/ws#client-authentication
        wsServer.handleUpgrade(request, socket, head, /** @param {any} ws */ ws => {
            wsServer.emit('connection', ws, request);
        });
    });

    httpServer.listen(3000, function () {
        const host = httpServer.address().address;
        const port = httpServer.address().port;

        console.log(`Listening on http://${host}:${port}`);

        callback(null);
    });
}
