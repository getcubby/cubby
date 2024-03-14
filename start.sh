#!/bin/bash

set -eu

export NODE_ENV=production

if [[ ! -f "/app/data/config.json" ]]; then
    echo "=> Create initial config.json"
    echo "{}" > "/app/data/config.json"
fi

export APP_ORIGIN="${CLOUDRON_APP_ORIGIN}"

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
export MAIL_FROM="${CLOUDRON_MAIL_FROM}"

echo "=> Ensure permissions"
chown -R cloudron:cloudron /app/data

echo "=> Start the server"
export DEBUG="cubby:*"
exec /usr/local/bin/gosu cloudron:cloudron npm start
