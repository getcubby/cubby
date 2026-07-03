'use strict';

exports.up = async function(db) {
    const result = await db.runSql(`SELECT column_name FROM information_schema.columns WHERE table_name = 'recents' AND column_name = 'username'`);
    if (result.rows.length === 0) return;

    await db.runSql('ALTER TABLE recents RENAME COLUMN username TO opener');
};

exports.down = async function(db) {
    const result = await db.runSql(`SELECT column_name FROM information_schema.columns WHERE table_name = 'recents' AND column_name = 'opener'`);
    if (result.rows.length === 0) return;

    await db.runSql('ALTER TABLE recents RENAME COLUMN opener TO username');
};
