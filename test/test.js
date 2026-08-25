/* global it, describe, before, after, afterEach */

import { app, click, cloudronCli, goto, loginOIDC, sendKeys, setupBrowser, takeScreenshot, teardownBrowser, clearCache, waitFor } from '@cloudron/charlie';

const NEW_FILE_NAME = 'charlie-test.txt';

describe('Application life cycle test', function () {
  before(setupBrowser);
  after(teardownBrowser);

  afterEach(async function () {
    await takeScreenshot(this.currentTest);
  });

  async function login() {
    await goto(`https://${app.fqdn}`, /Log ?in with/i);
    await click(/Log ?in with/i);
    await loginOIDC('My files');
  }

  async function logout() {
    await clearCache();
  }

  async function checkWelcomeMd() {
    await waitFor('Welcome.md');
  }

  async function checkHomeFiles() {
    await checkWelcomeMd();
    await waitFor(NEW_FILE_NAME);
  }

  async function createTestFile() {
    await click('New');
    await click('New file');
    await waitFor('New filename');
    await sendKeys('placeholder=Filename', NEW_FILE_NAME);
    await click('Save');
    await waitFor(NEW_FILE_NAME);
  }

  it('install app', cloudronCli.install);
  it('can login', login);
  it('can see Welcome.md', checkWelcomeMd);
  it('can create a new file', createTestFile);
  it('can logout', logout);

  it('can restart app', cloudronCli.restart);

  it('can login', login);
  it('can see home files', checkHomeFiles);
  it('can logout', logout);

  it('backup app', cloudronCli.createBackup);
  it('restore app', cloudronCli.restoreFromLatestBackup);

  it('can login', login);
  it('can see home files', checkHomeFiles);
  it('can logout', logout);

  it('move to different location', cloudronCli.changeLocation);

  it('can login', login);
  it('can see home files', checkHomeFiles);
  it('can logout', logout);

  it('uninstall app', cloudronCli.uninstall);

  it('install app for update', cloudronCli.appstoreInstall);

  it('can login', login);
  it('can see Welcome.md', checkWelcomeMd);
  it('can create a new file', createTestFile);
  it('can logout', logout);

  it('can update', cloudronCli.update);

  it('can login', login);
  it('can see Welcome.md', checkWelcomeMd);
  it('can see home files', checkHomeFiles);
  it('can logout', logout);

  it('uninstall app', cloudronCli.uninstall);
});
