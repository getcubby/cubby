# Cubby screenshots

Recreate the demo from a signed-in user, then capture the store images on a HiDPI laptop. Retakes use the same names and window size so the PNGs match.

Shots:

| File | URL |
|---|---|
| `screenshots/files.png` | `#files/home/` |
| `screenshots/markdown.png` | `Q4 roadmap.md` |
| `screenshots/search.png` | Top bar search `Sendlinger`, results open |
| `screenshots/share.png` | Share dialog on `Summit notes.md`, user tab |
| `screenshots/groupfolder.png` | `#files/groupfolders/design/` |
| `screenshots/webdav.png` | `#settings` (WebDAV section) |

Leave out Favorites, Recent, the file-drop dialog, the 3D viewer, the PDF viewer, Office, empty create dialogs, and delete confirmations.

## Capture

Follow the screenshot rules in `../../docs/docs/WRITING-GUIDE.md`. The app views include the Cubby sidebar (My files, Group folders, Favorites, Recent files, Shared with you, Shared by you). They do not include the browser chrome or the Cloudron dashboard.

Before every clip, evaluate in the page:

```js
JSON.stringify({ dpr: devicePixelRatio, innerWidth, innerHeight })
```

Proceed only when all of these are true:

- `devicePixelRatio === 2`. If it is `1`, move the Cursor window onto the HiDPI display and check again. A wider window on a 1080p monitor is not 2×.
- `innerWidth` is 1280 CSS pixels and `innerHeight` is 800. Resize the browser window to that. Do not maximize it.

Capture with `Page.captureScreenshot`, `fromSurface: true`, and `clip.scale: 1`. The PNG must be exactly 2× the CSS clip. Blur focus first (`document.activeElement.blur()`). If a section is taller than the viewport, scroll until the fields named below are in frame. Do not use `captureBeyondViewport` on a page with a sticky header; it paints that header twice.

Clip targets:

| Shot | Clip |
|---|---|
| Files, markdown, search, group folder | `.container` |
| Share | the open dialog |
| WebDAV | `.container`, scrolled so the WebDAV URL and username are in frame |

Do not call `Emulation.setDeviceMetricsOverride`. Do not set `clip.scale: 2` when `devicePixelRatio` is already 2. Do not upscale a 1× PNG. `browser_take_screenshot` is a layout check only; it is not the file that gets committed.

At 1280×800 CSS and 2×, a full `.container` clip is a 2560×1600 PNG.

Dialogs with `border-radius` leave a few background pixels in the corners of a rectangular clip. Flood-fill those corners the same way the writing guide does (white, within 24px of each corner) before saving. On a `.container` clip the corners are the sidebar and the page background. Leave those alone.

List view is the default. If a retake opens in grid view, set `localStorage.viewMode` to `list` and reload. The preview panel starts hidden. Before `files.png`, set `localStorage.previewPanelVisible` to `true` and reload.

## One app

Install this app at `https://cubby-demo.smartserver.io`. From this repo, with the CLI already logged in (the default server in `~/.cloudron.json`):

```bash
cloudron install -l cubby-demo
```

Reuse that install on later retakes. Reinstall only when the location is empty. If that hostname already has a DNS record, pick another location and write it here. `search.png` and `webdav.png` have to be taken on a Cloudron install. Search uses recoll, and the WebDAV section links to the dashboard app-password page. The local dev server has neither.

Leave `~/.cloudron.json` logged in. Do not paste the API token into chat.

## Files

Log in once. The first login copies `skeleton/` into My files. The git skeleton is `Welcome.md` and `Documents/`. The Cloudron image also includes `Pictures/` and `Videos/`. Delete all of those before adding the set below: `DELETE /api/v1/files?path=/home/Welcome.md`, and the same for `/home/Documents`, `/home/Pictures`, and `/home/Videos`. On a retake, delete the files and folders in this section and delete the Design group folder, then create them again. The signed-in user already exists, so the skeleton is not copied a second time.

Create a folder with `POST /api/v1/files?directory=true&path=...`. Create a file with `POST /api/v1/files?path=...` and the text as the body. Paths below are the `path` query. Lists show folders first, then files A–Z.

**My files** (`/home/...`)

| Path | Contents |
|---|---|
| `/home/Brand` | folder |
| `/home/Brand/Logo usage.md` | below |
| `/home/Brand/Color palette.txt` | below |
| `/home/Customers` | folder |
| `/home/Customers/Brightpath Studio.txt` | below |
| `/home/Customers/Hoffmann GmbH.txt` | below |
| `/home/Q4 roadmap.md` | below |
| `/home/Summit notes.md` | below |

`Logo usage.md`:

```markdown
# Logo usage

Use the mark on a light background. Leave clear space equal to the height of the mark.

Do not recolor the mark.
```

`Color palette.txt`:

```text
Color palette

Blue   #1a73e8
Navy   #0a2e4c
White  #ffffff
```

`Brightpath Studio.txt`:

```text
Brightpath Studio

Design review in December.
Contact: Nora Berg
```

`Hoffmann GmbH.txt`:

```text
Hoffmann GmbH

Renewal call on 12 November.
Contact: Lena Hoffmann
```

`Q4 roadmap.md`:

```markdown
# Q4 roadmap

The November release is the public launch. December is polish and support.

## Goals

- Ship the file sharing updates Maya Chen signed off at the summit
- Move support replies to the new macros
- Keep the press kit off the public site until 18 November

## November

- 3 November — homepage copy freeze
- 12 November — Hoffmann GmbH renewal call
- 18 November — public launch

## December

- Support queue review with Priya Nair
- Close the summit follow-ups

## Owners

- Design — Maya Chen
- Support — Priya Nair
- Roadmap — Girish
```

`Summit notes.md`:

```markdown
# Summit notes

Met Maya Chen after the product talk. She wants the homepage to name the November release and nothing earlier.

## Decisions

- Press kit stays internal until 18 November
- Follow-up dinner at Sendlinger Str. 1, München

## Follow-ups

- Send Maya the Brand folder
- Priya Nair drafts the support macros before December
```

The root list is Brand, Customers, Q4 roadmap.md, Summit notes.md.

**Design group folder.** `POST /api/v1/settings/groupfolders` with `{ "name": "Design", "slug": "design" }`. Then `PUT /api/v1/settings/groupfolders/design` with the signed-in user as `owner` and the second user as `viewer`:

```json
{
  "name": "Design",
  "members": [
    { "username": "<you>", "role": "owner" },
    { "username": "<second>", "role": "viewer" }
  ],
  "groupMembers": []
}
```

The owner has to stay in `members`. Log the second user into this app once so the user row exists. That person is whoever has already opened the app. On the test server that has been `test`. Do not insert a user who is not on the Cloudron. User sync removes them, and the share goes with them.

| Path | Contents |
|---|---|
| `/groupfolders/design/Homepage copy.md` | below |
| `/groupfolders/design/Launch checklist.txt` | below |
| `/groupfolders/design/Social posts.txt` | below |

`Homepage copy.md`:

```markdown
# Homepage

The November release is the public launch.

## Footer

Office: Sendlinger Str. 1, München

Copy freeze 3 November.
```

`Launch checklist.txt`:

```text
Launch checklist

- Homepage copy frozen 3 November
- Hoffmann renewal confirmed
- Public launch 18 November
```

`Social posts.txt`:

```text
Social posts

3 November — Copy freeze. Homepage stays as reviewed.
12 November — Hoffmann GmbH renewal call.
18 November — Public launch.
```

The folder list is Homepage copy.md, Launch checklist.txt, Social posts.txt.

**Sharing.** Two shares on `/Summit notes.md`, owned by the signed-in user.

- The second user, Read & write. Do not `POST /api/v1/shares` with `receiverUsername` or `receiverEmail`. That sends a "shared a file with you" email. Insert the row in `shares`: `id` is `sid-` plus 64 hex characters, `owner_username` is the signed-in user, `owner_groupfolder` is null, `file_path` is `/Summit notes.md`, `receiver_username` is the second user, `receiver_email` and `receiver_group` are null, `readonly` is 0, `expires_at` and `password_hash` are null.
- One public link, Read only, no password, no expiry. This one does not mail anyone. `POST /api/v1/shares` with `{ "ownerUsername": "<you>", "path": "/Summit notes.md", "readonly": true }` and no receiver.

The Share dialog puts users and links on separate tabs. `share.png` is the user tab. The link is still created. The preview panel on `Summit notes.md` lists both: the second username, and `link`.

**Search.** `Sendlinger` is not in any filename. It is in `Summit notes.md` (My files) and `Homepage copy.md` (Design). File writes schedule a recoll index about 10 seconds later. Wait until `GET /api/v1/search?query=*Sendlinger*` returns those two files before opening the dropdown. The search field ignores typing until it is focused, then waits 500ms.

## Take the shots

1. Confirm `devicePixelRatio` and 1280×800. List view. Preview panel visible. The sidebar starts at My files.
2. Files: `#files/home/`. Brand, Customers, Q4 roadmap.md, Summit notes.md. Select Summit notes.md. The Details tab shows the name and Shared with (the second username, and `link`).
3. Markdown: open `Q4 roadmap.md`. Hover `.document-outline` so the outline lists Goals, November, December, and Owners. The title is in frame.
4. Search: from My files, focus the top bar, type `Sendlinger`, and wait until the dropdown lists Summit notes.md under My files and Homepage copy.md under Design. Do not click the backdrop. Clip `.container` while the panel is open.
5. Share: open the Share dialog on Summit notes.md. The user tab shows the second username as Read & write. Clip the dialog.
6. Group folder: `#files/groupfolders/design/`. Homepage copy.md, Launch checklist.txt, Social posts.txt. Sidebar on Group folders.
7. WebDAV: `#settings`, on the Cloudron install. The WebDAV section shows `https://cubby-demo.smartserver.io/webdav/<username>/` and the username. Clip `.container` with those fields in frame.

Write each PNG under `screenshots/`. Check the bitmap is 2× the CSS clip before keeping it.
