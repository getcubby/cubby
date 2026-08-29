# Cubby

Cubby is a pure filesharing app with some built-in viewers (text, code, pdf, images, ...).
It can open and edit office documents through the office app configured on your Cloudron (Collabora Online or OnlyOffice).

The app is mainly developed by the [Cloudron](https://cloudron.io) team to provide an open source file sharing application.

Currently only OpenID as authentication is supported.

## Issues and Feature requests

Report any issues or feature request at https://forum.cloudron.io/category/132/cubby

## Deployment

Download and build the app:
```
curl -L https://git.cloudron.io/cubby/cubby/-/archive/master/cubby-master.tar | tar x
cd cubby-master
npm install
cd frontend
npm install
npm run build
```

Expose environment variables to configure the app:
```
# public origin
APP_ORIGIN="https://example.com"    # must include schema http:// or https://

# local server port, usually behind a reverse proxy
PORT="3000"

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

During development the user directory is a list of hardcoded users to test with and provided as a mock OpenID provider.

## WebDAV

Cubby exposes a WebDAV endpoint so you can open files from a file manager, tablet, or backup app.

```
https://<your-cubby-domain>/webdav/<username>/
```

`<username>` must match the account you authenticate as. After login the root lists `home/` (personal files), `shares/` (shared with you), and `groupfolders/`.

On Cloudron, create an **App password** in the dashboard under **Profile → App passwords**, then use your Cloudron username and that password in the WebDAV client. Browser SSO is not used for WebDAV.

In the app, the profile menu item **WebDAV** shows the URL and a link to create an app password.

Example mounts:

* GNOME Files: `davs://<your-cubby-domain>/webdav/<username>/`
* KDE Dolphin: `webdavs://<your-cubby-domain>/webdav/<username>/`
* macOS Finder: **Go → Connect to Server** with the `https://` URL above

rclone:

```
rclone config
# type: webdav
# url: https://<your-cubby-domain>/webdav/<username>/
# vendor: other
# user: <username>
# pass: <app password>
```

During local development (`CLOUDRON` unset), any username works as long as it matches the path, and the password is `password`.

### Windows

To enable Windows to accept WebDAV with basic authentication, the following registry key needs to be set:
See: <https://docs.nextcloud.com/server/latest/user_manual/en/files/access_webdav.html#accessing-files-using-microsoft-windows>

You can create a .reg file with the following content and import it into the registry:
```
Windows Registry Editor Version 5.00

[HKEY_LOCAL_MACHINE\SYSTEM\CurrentControlSet\Services\WebClient\Parameters]
"BasicAuthLevel"=dword:00000002
```

When the Registry has been updated, the WebClient service needs to be restarted.
In a cmd or powershell terminal with admin privileges, run the following commands:
```
net stop WebClient
net start WebClient
```