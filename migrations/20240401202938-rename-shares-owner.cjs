'use strict';

exports.up = async function(db) {
    await db.runSql('ALTER TABLE shares RENAME COLUMN owner TO owner_username');
    await db.runSql('ALTER TABLE shares ALTER COLUMN owner_username TYPE VARCHAR(128)');
    await db.runSql('ALTER TABLE shares ALTER COLUMN owner_username DROP NOT NULL');
};

exports.down = async function(db) {
    await db.runSql('ALTER TABLE shares ALTER COLUMN owner_username SET NOT NULL');
    await db.runSql('ALTER TABLE shares ALTER COLUMN owner_username TYPE VARCHAR(128)');
    await db.runSql('ALTER TABLE shares RENAME COLUMN owner_username TO owner');
};
