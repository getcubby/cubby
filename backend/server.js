import collab from './routes/collab.js';
import cors from './cors.js';
import favorites from './routes/favorites.js';
import files from './routes/files.js';
import groupFolders from './routes/groupfolders.js';
import http from 'http';
import { lastMile } from '@cloudron/connect-lastmile';
import misc from './routes/misc.js';
import mobile from './routes/mobile.js';
import office from './routes/office.js';
import path from 'path';
import shares from './routes/shares.js';
import users from './routes/users.js';
import usersDb from './users.js';
import webdav from './routes/webdav.js';
import { isScimEnabled, runScimSyncTick, SYNC_INTERVAL_MS } from './scimSync.js';
import * as tegel from '@cloudron/tegel';
import { WebSocketServer } from 'ws';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;
const APP_ORIGIN = process.env.APP_ORIGIN || `http://localhost:${PORT}`;

async function init() {
    const oidcConfig = process.env.CLOUDRON ? {} : {
        issuer: process.env.OIDC_ISSUER_BASE_URL,
        clientId: process.env.OIDC_CLIENT_ID,
        clientSecret: process.env.OIDC_CLIENT_SECRET,
        callbackUrl: `${APP_ORIGIN}/auth/callback`
    };

    const { app, router, express } = await tegel.createExpressApp({
            oidcConfig,
            skipLastMile: true,
            jsonBodySizeLimit: '100mb'
        });

        router.del = router.delete;

        // Auth routes (tegel)
        router.get('/auth/login', tegel.oidcRedirectToLoginProvider);
        router.get('/auth/callback', tegel.oidcCallback('/', '/?error=auth_failed', async (user) => {
            await usersDb.ensureUser({
                username: user.username,
                email: user.email ?? '',
                displayName: user.displayName ?? user.name ?? user.username
            });
        }));
        router.get('/auth/logout', tegel.logout('/'));

        // Public route
        router.get('/api/v1/config', misc.getConfig);

        router.get('/api/v1/profile', users.isAuthenticated, users.profile);

        router.get('/api/v1/settings/office', users.isAuthenticated, users.isAdmin, office.getSettings);
        router.put('/api/v1/settings/office', users.isAuthenticated, users.isAdmin, office.setSettings);

        router.post('/api/v1/settings/groupfolders', users.isAuthenticated, users.isAdmin, groupFolders.add);
        router.get('/api/v1/settings/groupfolders', users.isAuthenticated, users.isAdmin, groupFolders.list);
        router.get('/api/v1/settings/groupfolders/:id', users.isAuthenticated, users.isAdmin, groupFolders.get);
        router.put('/api/v1/settings/groupfolders/:id', users.isAuthenticated, users.isAdmin, groupFolders.update);
        router.del('/api/v1/settings/groupfolders/:id', users.isAuthenticated, users.isAdmin, groupFolders.remove);

        router.get('/api/v1/users', users.isAuthenticated, users.list);
        router.put('/api/v1/users', users.isAuthenticated, users.update);

        router.put('/api/v1/users/:username/admin', users.isAuthenticated, users.isAdmin, users.setAdmin);

        router.head('/api/v1/files', users.optionalAuth, files.head);
        router.get('/api/v1/files', users.optionalAuth, files.get);
        router.post('/api/v1/files', users.optionalAuth, files.add);
        router.put('/api/v1/files', users.optionalAuth, files.update);
        router.del('/api/v1/files', users.optionalAuth, files.remove);

        router.post('/api/v1/favorites', users.isAuthenticated, favorites.create);
        router.get('/api/v1/favorites', users.isAuthenticated, favorites.list);
        router.get('/api/v1/favorites/:id', users.isAuthenticated, favorites.get);
        router.del('/api/v1/favorites/:id', users.isAuthenticated, favorites.remove);

        router.get('/api/v1/shares', users.isAuthenticated, shares.listShares);
        router.post('/api/v1/shares', users.isAuthenticated, shares.createShare);
        router.del('/api/v1/shares', users.isAuthenticated, shares.removeShare);

        router.get('/api/v1/shares/:id', users.optionalAuth, shares.attachReceiver, shares.getShareLink);

        router.get('/api/v1/preview/:type/:id/:hash', users.optionalAuth, shares.optionalAttachReceiver, misc.getPreview);

        router.get('/api/v1/recent', users.isAuthenticated, misc.getRecent);
        router.get('/api/v1/download', users.isAuthenticated, misc.download);
        router.get('/api/v1/search', users.isAuthenticated, misc.search);

        router.get('/api/v1/collab/handle', users.isAuthenticated, collab.getHandle);

        router.get('/api/v1/office/handle', users.optionalAuth, office.getHandle);
        router.get('/api/v1/office/wopi/files/:handleId', office.wopiAuth, office.checkFileInfo);
        router.get('/api/v1/office/wopi/files/:handleId/contents', office.wopiAuth, office.getFile);
        router.post('/api/v1/office/wopi/files/:handleId/contents', office.wopiAuth, express.raw({ type: '*/*', limit: '1gb' }), office.putFile);

        router.get('/api/v1/mobile/config', mobile.getConfig);
        router.get('/api/v1/mobile/start', mobile.mobileStart);
        router.get('/api/v1/mobile/callback', mobile.callbackLandingFallback);
        router.post('/api/v1/mobile/code-to-token', express.json(), mobile.codeToToken);

        router.get('/.well-known/assetlinks.json', mobile.assetLinks);

        app.use('/', express.static(path.resolve(__dirname, '../frontend-dist')));
        app.use(lastMile());

        const mainApp = express();
        mainApp.use(cors({ origins: ['*'], allowCredentials: true }));
        mainApp.use('/api/healthcheck', (req, res) => { res.status(200).send(); });
        mainApp.use('/api', express.json());
        mainApp.use('/api', express.urlencoded({ limit: '100mb' }));
        mainApp.use(webdav.express());
        mainApp.use(app);

        const httpServer = http.createServer({ headersTimeout: 0, requestTimeout: 0 }, mainApp);
        const wsServer = new WebSocketServer({ noServer: true });

        // When Windows (or other clients) send PUT with Expect: 100-continue, we must send
        // 100 Continue before they send the body, otherwise the body never arrives (0-byte uploads).
        httpServer.on('checkContinue', (req, res) => {
            if (req.method === 'PUT' && req.url && req.url.startsWith('/webdav/')) {
                res.writeContinue();
                mainApp(req, res);
            } else {
                res.writeHead(417, { 'Content-Length': '0' });
                res.end();
            }
        });

        wsServer.on('connection', collab.setupWSConnection);

        httpServer.on('upgrade', (request, socket, head) => {
            console.log('TODO: add websocket auth!');
            wsServer.handleUpgrade(request, socket, head, /** @param {any} ws */ ws => {
                wsServer.emit('connection', ws, request);
            });
        });

    await new Promise((resolve, reject) => {
        httpServer.listen(3000, function () {
            const host = httpServer.address().address;
            const port = httpServer.address().port;
            console.log(`Listening on http://${host}:${port}`);
            resolve();
        });
        httpServer.once('error', reject);
    });

    if (isScimEnabled()) {
        runScimSyncTick().catch((err) => {
            console.error('Initial SCIM sync failed:', err);
        });
        setInterval(() => {
            runScimSyncTick();
        }, SYNC_INTERVAL_MS);
    }
}

export default {
    init
};
