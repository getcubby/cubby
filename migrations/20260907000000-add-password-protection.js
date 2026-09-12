'use strict';

exports.up = async function(db) {
    await db.runSql(`ALTER TABLE shares ADD COLUMN password_hash VARCHAR(255)`);
    await db.runSql(`ALTER TABLE filedrops ADD COLUMN password_hash VARCHAR(255)`);
};

exports.down = async function(db) {
    await db.runSql(`ALTER TABLE shares DROP COLUMN password_hash`);
    await db.runSql(`ALTER TABLE filedrops DROP COLUMN password_hash`);
};
