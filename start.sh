#!/bin/bash

set -eu

export NODE_ENV=production

export APP_ORIGIN="${CLOUDRON_APP_ORIGIN}"
export APP_DATA_ROOT="/app/data"

export CONFIG_FILE_PATH="${APP_DATA_ROOT}/config.json"
export USER_DATA_PATH="${APP_DATA_ROOT}/data"
export GROUPS_DATA_PATH="${APP_DATA_ROOT}/groups"
export THUMBNAIL_PATH="${APP_DATA_ROOT}/groups"
export SESSION_PATH="${APP_DATA_ROOT}/sessions"
export SESSION_SECRET_FILE_PATH="${APP_DATA_ROOT}/.session.secret"
export SEARCH_INDEX_PATH="${APP_DATA_ROOT}/.recoll"
export RECENTS_CACHE_PATH="${APP_DATA_ROOT}/.recents.json"

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

if [[ ! -f "/app/data/config.json" ]]; then
    echo "==> Create initial config.json"
    echo "{}" > "/app/data/config.json"
fi

echo "==> Ensure permissions"
chown -R cloudron:cloudron /app/data

echo "==> Run database migrations"
DATABASE_URL="postgres://${POSTGRESQL_USERNAME}:${POSTGRESQL_PASSWORD}@${POSTGRESQL_HOST}/${POSTGRESQL_DATABASE}" ./node_modules/.bin/db-migrate up

echo "==> Start the server"
export DEBUG="cubby:*"
exec /usr/local/bin/gosu cloudron:cloudron ./app.js
