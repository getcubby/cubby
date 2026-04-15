#!/usr/bin/env node

'use strict';

/* jshint esversion: 8 */
/* global describe */
/* global before */
/* global after */
/* global it */
/* global xit */

require('chromedriver');

const execSync = require('child_process').execSync,
    assert = require('node:assert/strict'),
    fs = require('fs'),
    path = require('path'),
    { Builder, By, Key, until } = require('selenium-webdriver'),
    { Options } = require('selenium-webdriver/chrome');

if (!process.env.USERNAME || !process.env.PASSWORD) {
    console.log('USERNAME and PASSWORD env vars need to be set');
    process.exit(1);
}

describe('Application life cycle test', function () {
    this.timeout(0);

    const EXEC_ARGS = { cwd: path.resolve(__dirname, '..'), stdio: 'inherit' };
    const LOCATION = process.env.LOCATION || 'test';
    const USERNAME = process.env.USERNAME;
    const PASSWORD = process.env.PASSWORD;
    const TEST_TIMEOUT = parseInt(process.env.TIMEOUT, 10) || 10000;

    let browser, app;

    before(function () {
        const chromeOptions = new Options().windowSize({ width: 1280, height: 1024 });
        if (process.env.CI) chromeOptions.addArguments('no-sandbox', 'disable-dev-shm-usage', 'headless');
        browser = new Builder().forBrowser('chrome').setChromeOptions(chromeOptions).build();
    });

    after(function () {
        browser.quit();
    });

    async function saveScreenshot(fileName) {
        if (!fs.existsSync('./screenshots')) fs.mkdirSync('./screenshots');

        const screenshotData = await browser.takeScreenshot();
        fs.writeFileSync(`./screenshots/${fileName.replaceAll(' ', '_')}-${new Date().getTime()}.png`, screenshotData, 'base64');
    }

    afterEach(async function () {
        if (!process.env.CI || !app) return;

        const currentUrl = await browser.getCurrentUrl();
        if (!currentUrl.includes(app.domain)) return;
        assert.strictEqual(typeof this.currentTest.title, 'string');
        await saveScreenshot(this.currentTest.title);
    });

    function getAppInfo() {
        var inspect = JSON.parse(execSync('cloudron inspect'));
        app = inspect.apps.filter(function (a) { return a.location.indexOf(LOCATION) === 0; })[0];
        assert.ok(app && typeof app === 'object');
    }

    async function waitForElement(elem) {
        await browser.wait(until.elementLocated(elem), TEST_TIMEOUT);
        await browser.wait(until.elementIsVisible(browser.findElement(elem)), TEST_TIMEOUT);
    }

    async function login() {
        await browser.manage().deleteAllCookies();
        await browser.get(`https://${app.fqdn}`);

        await waitForElement(By.id('loginButton'));
        await browser.findElement(By.id('loginButton')).click();

        // give some time to let UI settle for session detection
        await browser.sleep(2000);

        if (await browser.findElements(By.id('inputUsername')).then(found => !!found.length)) {
            await waitForElement(By.id('inputUsername'));
            await browser.findElement(By.id('inputUsername')).sendKeys(USERNAME);
            await browser.findElement(By.id('inputPassword')).sendKeys(PASSWORD);
            await browser.findElement(By.id('loginSubmitButton')).click();
        }

        await waitForElement(By.id('profileMenuDropdown'));
    }

    async function logout() {
        await browser.get('https://' + app.fqdn);
        await browser.sleep(2000);

        await waitForElement(By.id('profileMenuDropdown'));
        await browser.findElement(By.id('profileMenuDropdown')).click();
        await browser.sleep(1000);

        await waitForElement(By.xpath('//div[contains(text(), "Logout")]'));
        await browser.findElement(By.xpath('//div[contains(text(), "Logout")]')).click();

        // wait for logout to happen
        await browser.sleep(2000);
        await waitForElement(By.id('loginButton'));
    }

    xit('build app', function () { execSync('cloudron build', EXEC_ARGS); });
    it('install app', function () { execSync(`cloudron install --location ${LOCATION}`, EXEC_ARGS); });

    it('can get app information', getAppInfo);
    it('can login', login);
    it('can logout', logout);

    it('can restart app', function () { execSync(`cloudron restart --app ${app.id}`, EXEC_ARGS); });

    it('can login', login);
    it('can logout', logout);

    it('backup app', function () { execSync(`cloudron backup create --app ${app.id}`, EXEC_ARGS); });
    it('restore app', function () {
        const backups = JSON.parse(execSync('cloudron backup list --raw --app ' + app.id));
        execSync('cloudron uninstall --app ' + app.id, EXEC_ARGS);
        execSync('cloudron install --location ' + LOCATION, EXEC_ARGS);
        getAppInfo();
        execSync(`cloudron restore --backup ${backups[0].id} --app ${app.id}`, EXEC_ARGS);
    });

    it('can login', login);
    it('can logout', logout);

    it('move to different location', async function () {
        await browser.get('about:blank');
        execSync(`cloudron configure --location ${LOCATION}2 --app ${app.id}`, EXEC_ARGS);
    });

    it('can get app information', getAppInfo);
    it('can login', login);
    it('can logout', logout);

    it('uninstall app', async function () {
        await browser.get('about:blank');
        execSync(`cloudron uninstall --app ${app.id}`, EXEC_ARGS);
    });

    // test update
    it('install app for update', function () { execSync(`cloudron install --appstore-id io.cloudron.cubby --location ${LOCATION}`, EXEC_ARGS); });

    it('can get app information', getAppInfo);
    it('can login', login);
    it('can logout', logout);

    it('can update', function () { execSync(`cloudron update --app ${app.id}`, EXEC_ARGS); });
    it('can get app information', getAppInfo);

    it('can login', login);
    it('can logout', logout);

    it('uninstall app', async function () {
        await browser.get('about:blank');
        execSync(`cloudron uninstall --app ${app.id}`, EXEC_ARGS);
    });
});
