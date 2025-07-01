'use strict';

exports.up = async function(db) {
    await db.runSql('ALTER TABLE users DROP CONSTRAINT users_email_key');
};

exports.down = async function(db) {
    await db.runSql('ALTER TABLE users ADD CONSTRAINT users_email_key UNIQUE (email);');
};
