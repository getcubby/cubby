#!/usr/bin/env node

/* global it, describe, before, after, afterEach */

import { app, click, cloudronCli, goto, loginOIDC, setupBrowser, takeScreenshot, teardownBrowser, waitFor, clearCache } from '@cloudron/charlie';

describe('Application life cycle test', function () {
    before(setupBrowser);
    after(teardownBrowser);

    afterEach(async function () {
        await takeScreenshot(this.currentTest);
    });

    async function login() {
        await goto(`https://${app.fqdn}`, /Log in with/);
        await click(/Log in with/);
        await loginOIDC('My Files');
    }

    async function logout() {
        await clearCache();
    }

    it('install app', cloudronCli.install);
    it('can login', login);
    it('can logout', logout);

    it('can restart app', cloudronCli.restart);

    it('can login', login);
    it('can logout', logout);

    it('backup app', cloudronCli.createBackup);
    it('restore app', cloudronCli.restoreFromLatestBackup);

    it('can login', login);
    it('can logout', logout);

    it('move to different location', cloudronCli.changeLocation);

    it('can login', login);
    it('can logout', logout);

    it('uninstall app', cloudronCli.uninstall);

    it('install app for update', cloudronCli.appstoreInstall);

    it('can login', login);
    it('can logout', logout);

    it('can update', cloudronCli.update);

    it('can login', login);
    it('can logout', logout);

    it('uninstall app', cloudronCli.uninstall);
});
