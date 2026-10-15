# cubby

File sharing app: Node backend (`backend/`, `app.js`) and Vue 3 UI (`frontend/`). Data is stored in SQLite (`backend/schema.js`).

Sibling s42 apps live in `../`. Shared Vue UI is `@cloudron/pankow` (source: `../../utils/pankow`). Shared Node helpers (Express app, OIDC, sessions, SCIM, app-bridge client) are `@cloudron/tegel` (source: `../../utils/tegel`). Platform code is `../../platform`. App-bridge server and the rest of the platform live in `../../platform/box`.

Reuse patterns from sibling s42 apps instead of inventing new ones. Prefer pankow components and tegel APIs whenever they exist. Office editing goes through the Cloudron office app, not a local Collabora.

## Develop

Create an OpenID client on a Cloudron. Redirect URI must be `http://localhost:3000/auth/callback`. `./develop.sh` builds the frontend, writes a `.env.sh` template if missing, and starts the app with a local SQLite database.

```bash
./develop.sh
```

`./develop.sh --fresh` removes the local SQLite database (`.data/cubby.db`) and the `frontend-dist/` build.

Frontend hot reload in a second terminal (Vite on port 5555):

```bash
cd frontend/
npm run dev
```

## Test

```bash
npm test
```

`npm test` runs `./run-tests`, which uses a SQLite database under `/tmp/cubby_test` and mocha on `backend/test/*-test.js` and `backend/routes/test/*-test.js`. A single file:

```bash
./run-tests backend/test/files-test.js
```

## Shared libraries

- **Pankow** — Vue 3 components (`MainLayout`, `TopBar`, `Button`, `Dialog`, `TextInput`, `TableView`, `LoginView`, `DirectoryView`, …). Import from `@cloudron/pankow`. Do not add a parallel UI kit.
- **Tegel** — `createExpressApp()`, `oidcRedirectToLoginProvider`, `oidcCallback`, `logout`, `requireAuth`, `HttpError` / `HttpSuccess`, `appBridge`.
- **Box app-bridge** — platform HTTP API (`../../platform/box/src/app-bridge.js`). Apps call it through `tegel.appBridge`, not by copying box code.

## API docs

When changing the HTTP API, update the OpenAPI spec at `../website/openapi/cubby.yaml`.

## Code style

- Javascript ESM
- Single quotes, semicolons
- Function declarations, not function expressions
- Functional patterns where possible
- Remove trailing whitespace
- Vue 3 `<script setup>`; use `@cloudron/pankow` as much as possible
- Backend: tegel for the Express app, OIDC, and sessions; `safe()` from `@cloudron/safetydance` for fallible calls
- Match the indent of the file being edited

## SCIM

These are general guidelines for an app that uses the Cloudron directory. Apply only the parts that fit this app. An app with no groups does not need a groups table. A periodic SCIM sync is only for an app that keeps a local copy of directory users or groups and needs those display fields and `active` flags kept current.

Directory users and groups are identified by Cloudron ids (`users.id`, shaped `uid-…`, and `groups.id`), not by username or group name. A Cloudron username cannot change. A user can be deleted and created again with the same username, and that account gets a new id. Keep content, memberships, and other stored rows on the id. The new person must not see the old user's content, and a username match must not retarget the old row to the new id. Store username, email, display name, and group name for display. Email, display name, and group name can change.

OIDC `sub` is the username. On login, resolve it to the Cloudron user id, then update the stored username, email, and display name from the OIDC claims. Do not wait for SCIM to refresh the person who just signed in. A successful login marks that user active.

Run a periodic SCIM sync. It inserts directory users and groups that are active, including ones this app has never stored, and refreshes username, email, display name, and group name. It stores `active` on users and groups. A user or group missing from a successful, non-empty SCIM response is marked inactive. Do not insert one that is missing or inactive and has no local row. An empty SCIM response leaves every `active` flag unchanged. A user or group that appears again is marked active, and an active group's member list is refreshed.

Do not delete users, groups, files, or memberships when a row becomes inactive.

Pickers for new shares, members, and other new assignments list only active users and groups. An existing resource still shows its inactive users and groups, and the only action on those rows is remove. Saving the resource keeps an inactive member unless they were explicitly removed. If the only owner is inactive, another existing member or an admin can still remove them.
