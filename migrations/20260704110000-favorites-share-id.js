'use strict';

const crypto = require('crypto');

exports.up = async function(db) {
    const result = await db.runSql(`SELECT column_name FROM information_schema.columns WHERE table_name = 'favorites' AND column_name = 'share_id'`);
    if (result.rows.length > 0) return;

    await db.runSql('ALTER TABLE favorites ADD COLUMN share_id VARCHAR(128)');
    await db.runSql('ALTER TABLE favorites ADD CONSTRAINT favorites_share_id_fkey FOREIGN KEY (share_id) REFERENCES shares(id) ON DELETE CASCADE');

    const favorites = await db.runSql('SELECT id FROM favorites');
    for (const row of favorites.rows) {
        await db.runSql('UPDATE favorites SET id = ? WHERE id = ?', [ crypto.randomUUID(), row.id ]);
    }

    await db.runSql('CREATE UNIQUE INDEX favorites_user_share_path ON favorites (username, share_id, file_path) WHERE share_id IS NOT NULL');
    await db.runSql('CREATE UNIQUE INDEX favorites_user_owner_path ON favorites (username, owner_username, owner_groupfolder, file_path) WHERE share_id IS NULL');
};

exports.down = async function(db) {
    const result = await db.runSql(`SELECT column_name FROM information_schema.columns WHERE table_name = 'favorites' AND column_name = 'share_id'`);
    if (result.rows.length === 0) return;

    await db.runSql('DROP INDEX IF EXISTS favorites_user_share_path');
    await db.runSql('DROP INDEX IF EXISTS favorites_user_owner_path');
    await db.runSql('ALTER TABLE favorites DROP CONSTRAINT IF EXISTS favorites_share_id_fkey');
    await db.runSql('ALTER TABLE favorites DROP COLUMN share_id');
};
