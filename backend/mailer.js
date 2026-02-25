import assert from 'assert';
import debug from 'debug';
import fs from 'fs';
import handlebars from 'handlebars';
import nodemailer from 'nodemailer';
import path from 'path';
import { fileURLToPath } from 'url';
import smtpTransport from 'nodemailer-smtp-transport';
import shares from './shares.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const debugLog = debug('cubby:mailer');

const CAN_SEND_EMAIL = (process.env.MAIL_SMTP_SERVER && process.env.MAIL_SMTP_PORT && process.env.MAIL_FROM);
if (CAN_SEND_EMAIL) {
    console.log(`Can send emails. Email notifications are sent out as ${process.env.MAIL_FROM}`);
} else {
    console.log(`
No email configuration found. Set the following environment variables:
    MAIL_SMTP_SERVER
    MAIL_SMTP_PORT
    MAIL_SMTP_USERNAME
    MAIL_SMTP_PASSWORD
    MAIL_FROM
    MAIL_FROM_DISPLAY_NAME
    `);
}

// TODO dedupe from server.js
const PORT = process.env.PORT || 3000;
const APP_ORIGIN = process.env.APP_ORIGIN || `http://localhost:${PORT}`;

async function newShare(emailAddress, shareId) {
    assert.strictEqual(typeof emailAddress, 'string');
    assert.strictEqual(typeof shareId, 'string');

    debugLog(`newShare: to:${emailAddress} shareId:${shareId}`);

    const share = await shares.get(shareId);
    assert.ok(share, `Failed to get share ${shareId}`);

    const emailSubject = `${share.ownerUsername || share.ownerGroupfolder} shared a file with you`;

    const emailTemplateHtml = handlebars.compile(fs.readFileSync(path.resolve(__dirname, 'templates/new-share-email.html'), 'utf8'));
    const emailTemplateText = handlebars.compile(fs.readFileSync(path.resolve(__dirname, 'templates/new-share-email.text'), 'utf8'));

    const emailTemplateData = { sharedWith: share.receiverUsername, sharedBy: share.ownerUsername || share.ownerGroupfolder, sharedPath: share.filePath.slice(1) /* remove slash */, appDomain: new URL(APP_ORIGIN).hostname, actionLink: `${APP_ORIGIN}#files/shares/${shareId}/` };

    const emailBodyText = emailTemplateText(emailTemplateData);
    const emailBodyHtml = emailTemplateHtml(emailTemplateData);

    if (!CAN_SEND_EMAIL) {
        console.log(`Would send email to ${emailAddress}:`);
        console.log('-----------------------------');
        console.log(`Subject: ${emailSubject}`);
        console.log(emailBodyText);
        console.log('-----------------------------');
        return;
    }

    const transport = nodemailer.createTransport(smtpTransport({
        host: process.env.MAIL_SMTP_SERVER,
        port: process.env.MAIL_SMTP_PORT,
        auth: {
            user: process.env.MAIL_SMTP_USERNAME,
            pass: process.env.MAIL_SMTP_PASSWORD
        }
    }));

    const mail = {
        from: `${process.env.MAIL_FROM_DISPLAY_NAME || 'Cubby'} <${process.env.MAIL_FROM}>`,
        to: emailAddress,
        subject: emailSubject,
        text: emailBodyText,
        html: emailBodyHtml
    };

    await transport.sendMail(mail);
}

export default {
    newShare
};
