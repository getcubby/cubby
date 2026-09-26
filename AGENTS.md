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
