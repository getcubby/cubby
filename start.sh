#!/bin/bash

set -eu

export NODE_ENV=production

export APP_ORIGIN="${CLOUDRON_APP_ORIGIN}"

# CLOUDRON_OIDC_PROVIDER_NAME is not supported
export OIDC_ISSUER_BASE_URL="${CLOUDRON_OIDC_ISSUER}"
export OIDC_CLIENT_ID="${CLOUDRON_OIDC_CLIENT_ID}"
export OIDC_CLIENT_SECRET="${CLOUDRON_OIDC_CLIENT_SECRET}"

export POSTGRESQL_HOST="${CLOUDRON_POSTGRESQL_HOST}"
export POSTGRESQL_PORT="${CLOUDRON_POSTGRESQL_PORT}"
export POSTGRESQL_DATABASE="${CLOUDRON_POSTGRESQL_DATABASE}"
export POSTGRESQL_USERNAME="${CLOUDRON_POSTGRESQL_USERNAME}"
export POSTGRESQL_PASSWORD="${CLOUDRON_POSTGRESQL_PASSWORD}"

export MAIL_SMTP_SERVER="${CLOUDRON_MAIL_SMTP_SERVER}"
export MAIL_SMTP_PORT="${CLOUDRON_MAIL_SMTP_PORT}"
export MAIL_SMTP_USERNAME="${CLOUDRON_MAIL_SMTP_USERNAME}"
export MAIL_SMTP_PASSWORD="${CLOUDRON_MAIL_SMTP_PASSWORD}"
export MAIL_FROM_DISPLAY_NAME="${CLOUDRON_MAIL_FROM_DISPLAY_NAME:-Cubby}"
export MAIL_FROM="${CLOUDRON_MAIL_FROM}"

# keep in sync with backend/paths.js
echo "==> Ensure data directories"
mkdir -p /app/data/{data,groups,thumbnails,sessions,.recoll}

echo "==> Ensure permissions"
chown -R cloudron:cloudron /app/data

echo "==> Remove legacy recents file"
rm -f /app/data/.recents.json

echo "==> Run database migrations"
DATABASE_URL="postgres://${POSTGRESQL_USERNAME}:${POSTGRESQL_PASSWORD}@${POSTGRESQL_HOST}:${POSTGRESQL_PORT}/${POSTGRESQL_DATABASE}" ./node_modules/.bin/db-migrate up

echo "==> Start the server"
export DEBUG="cubby:*"
exec /usr/local/bin/gosu cloudron:cloudron ./app.js
