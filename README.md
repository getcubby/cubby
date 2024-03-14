# Cubby

Cubby is a pure filesharing app with some built-in viewers (text, code, pdf, images, ...).
It further supports an external collabora office installation.

The app is mainly developed by the [Cloudron](https://cloudron.io) team to provide an open source file sharing application.

Currently only OpenID as authentication is supported.

## Issues and Feature requests

Report any issues or feature request at https://forum.cloudron.io/category/132/cubby

## Deployment

Download and build the app:
```
curl -L https://git.cloudron.io/cloudron/cubby/-/archive/master/cubby-master.tar | tar x
cd cubby-master
npm install
npm run build
```

Expose environment variables to configure the app:
```
# public origin
APP_ORIGIN="https://example.com"    # must include schema http:// or https://

# local server port, usually behind a reverse proxy
PORT="3000"

# data on disk
CONFIG_FILE_PATH="/path/config.json"
USER_DATA_ROOT="/path/data/user/"
GROUPS_DATA_ROOT="/path/data/groups/"
THUMBNAIL_ROOT="/path/data/thumbnails/"
SESSION_PATH="/path/data/sessions/"

# database
POSTGRESQL_HOST="postgres"
POSTGRESQL_PORT="3306"
POSTGRESQL_DATABASE="cubby"
POSTGRESQL_USERNAME="root"
POSTGRESQL_PASSWORD="password"

# OpenID provider
OIDC_ISSUER_BASE_URL="https://openid.provider.com"
OIDC_CLIENT_ID="client-id"
OIDC_CLIENT_SECRET="client-secret"

# SMTP server (optional)
MAIL_SMTP_SERVER="mail"
MAIL_SMTP_PORT="25"
MAIL_SMTP_USERNAME="username"
MAIL_SMTP_PASSWORD="password"
MAIL_FROM="admin@cubby.local"
```

Run the app:
```
npm start
```

## Project development

A docker environment is required for the PostgreSQL database instance.

Install app dependencies
```
npm install
```

The main application can be run using a helper script, which will create and initialize the datbase:
```
./develop.sh
```
This will also print the frontend asset builder and watcher command to be run in a second terminal.
