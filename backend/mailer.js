exports = module.exports = {
    newShare
};

const assert = require('assert'),
    debug = require('debug')('cubby:mailer'),
    fs = require('fs'),
    handlebars = require('handlebars'),
    nodemailer = require('nodemailer'),
    path = require('path'),
    smtpTransport = require('nodemailer-smtp-transport'),
    shares = require('./shares.js');

const CAN_SEND_EMAIL = (process.env.CLOUDRON_MAIL_SMTP_SERVER && process.env.CLOUDRON_MAIL_SMTP_PORT && process.env.CLOUDRON_MAIL_FROM);
if (CAN_SEND_EMAIL) {
    console.log(`Can send emails. Email notifications are sent out as ${process.env.CLOUDRON_MAIL_FROM}`);
} else {
    console.log(`
No email configuration found. Set the following environment variables:
    CLOUDRON_MAIL_SMTP_SERVER
    CLOUDRON_MAIL_SMTP_PORT
    CLOUDRON_MAIL_SMTP_USERNAME
    CLOUDRON_MAIL_SMTP_PASSWORD
    CLOUDRON_MAIL_FROM
    `);
}

async function newShare(emailAddress, shareId) {
    assert.strictEqual(typeof emailAddress, 'string');
    assert.strictEqual(typeof shareId, 'string');

    debug(`newShare: to:${emailAddress} shareId:${shareId}`);

    const share = await shares.get(shareId);
    assert.ok(share, `Failed to get share ${shareId}`);

    const emailSubject = `${share.owner} shared a file with you`;

    const emailTemplateHtml = handlebars.compile(fs.readFileSync(path.resolve(__dirname, 'templates/new-share-email.html'), 'utf8'));
    const emailTemplateText = handlebars.compile(fs.readFileSync(path.resolve(__dirname, 'templates/new-share-email.text'), 'utf8'));

    const emailTemplateData = { sharedWith: share.receiverUsername, sharedBy: share.owner, sharedPath: share.filePath.slice(1) /* remove slash */, appDomain: process.env.CLOUDRON_APP_DOMAIN, actionLink: `${process.env.CLOUDRON_APP_ORIGIN}#files/shares/${shareId}/` };

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
        host: process.env.CLOUDRON_MAIL_SMTP_SERVER,
        port: process.env.CLOUDRON_MAIL_SMTP_PORT,
        auth: {
            user: process.env.CLOUDRON_MAIL_SMTP_USERNAME,
            pass: process.env.CLOUDRON_MAIL_SMTP_PASSWORD
        }
    }));

    const mail = {
        from: `Cubby <${process.env.CLOUDRON_MAIL_FROM}>`,
        to: emailAddress,
        subject: emailSubject,
        text: emailBodyText,
        html: emailBodyHtml
    };

    await transport.sendMail(mail);
}
