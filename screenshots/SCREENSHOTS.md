# Cubby screenshots

Recreate the demo from a signed-in user, then capture the store images on a HiDPI laptop. Retakes use the same names and window size so the PNGs match.

Shots:

| File | URL |
|---|---|
| `screenshots/files.png` | `#files/home/` |
| `screenshots/markdown.png` | `Roadmap.md` |
| `screenshots/search.png` | Top bar search `Brightpath`, results open |
| `screenshots/share.png` | Share dialog on `Notes.md`, user tab |
| `screenshots/groupfolder.png` | `#files/groupfolders/design/` |
| `screenshots/webdav.png` | `#settings` (WebDAV section) |

Leave out Favorites, Recent, the file-drop dialog, the 3D viewer, the PDF viewer, Office, empty create dialogs, and delete confirmations.

## Capture

Follow the screenshot rules in `../../docs/docs/WRITING-GUIDE.md`. The app views include the Cubby sidebar (My files, Group folders, Favorites, Recent files, Shared with you, Shared by you). They do not include the browser chrome or the Cloudron dashboard.

### Window

Use a separate Google Chrome window. The Cursor browser tab cannot be dragged out, and its page stays narrower than the monitor because of the side panel. `Browser.setWindowBounds` is denied on that target, and `window.resizeTo` does not change its `innerWidth`.

Launch Chrome as its own app window, with a fresh profile and a remote debugging port:

```bash
google-chrome \
  --remote-debugging-port=9223 \
  --user-data-dir=/tmp/cubby-chrome-profile \
  --no-first-run \
  --no-default-browser-check \
  --disable-extensions \
  --disable-translate \
  --ozone-platform=wayland \
  --window-position=40,40 \
  --window-size=1400,980 \
  --app='https://cubby-demo.smartserver.io/#/files/home/'
```

That command opens on the 1920×1080 output at `devicePixelRatio` 1. Move that Chrome window onto the HiDPI panel. On this laptop the panel is 1440×900 CSS pixels (2880×1800 at 2×). Measure again after the move. Do not pass `--force-device-scale-factor`, and do not call `Emulation.setDeviceMetricsOverride`.

The Cursor browser is already signed in. Copy its `connect.sid` for the host in `--app` into this Chrome with `Network.setCookie` (`httpOnly`, `secure`, `path: /`), then reload. The cookie is plaintext in one of `~/.config/Cursor/Partitions/*/Cookies` (`encrypted_value` is empty). Find the file that has that host and name. Do not print the value.

Connect to `http://127.0.0.1:9223/json` and use the page target's debugger socket. Call `Browser.getWindowForTarget`, then `Browser.setWindowBounds` with `windowState: 'normal'`. These shots stay 1280×800 CSS. Do not maximize or fullscreen: fullscreen on this panel is 1440×900. Start from the outer size above and add the gap between the measured inner size and 1280×800 until `innerWidth` is 1280 and `innerHeight` is 800.

Before every clip, evaluate in the page:

```js
JSON.stringify({ dpr: devicePixelRatio, innerWidth, innerHeight, screenW: screen.width, screenH: screen.height })
```

Proceed only when all of these are true:

- `devicePixelRatio === 2`, `screen.width === 1440`, and `screen.height === 900`. If `devicePixelRatio` is `1`, the Chrome window is still on the 1080p output. Move it and check again. A wider window on that output is not 2×.
- `innerWidth` is 1280 CSS pixels and `innerHeight` is 800. Do not maximize the window.

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

Log in once. The first login copies `skeleton/` into My files. The git skeleton is `Welcome.md` and `Documents/`. The Cloudron image also includes `Pictures/` and `Videos/`. Copy one jpeg out of Pictures into `/home/Photos/Harbor.jpg` before deleting Pictures. Then delete the skeleton: `DELETE /api/v1/files?path=/home/Welcome.md`, and the same for `/home/Documents`, `/home/Pictures`, and `/home/Videos`. On a retake, delete the files and folders in this section and delete the Design group folder, then create them again. The signed-in user already exists, so the skeleton is not copied a second time.

Create a folder with `POST /api/v1/files?directory=true&path=...`. Create a file with `POST /api/v1/files?path=...&mtime=...` and the text as the body. `mtime` is an ISO timestamp. Paths below are the `path` query. Lists show folders first, then files A–Z. A folder's modified time follows its newest child, so set the file times and leave the folders alone.

Keep names short. The preview panel is open on the file shots, and a long name is cut off in the list.

Set `mtime` from the day of the shot, called D:

| Offset | Label |
|---|---|
| D−2 days | 2 days ago |
| D−4 days | 4 days ago |
| D−6 days | 6 days ago |
| D−8 days | 1 week ago |
| D−14 days | 2 weeks ago |
| D−21 days | 3 weeks ago |

**My files** (`/home/...`)

| Path | mtime | Contents |
|---|---|---|
| `/home/Brand` | | folder |
| `/home/Brand/Logo.md` | D−21 days | below |
| `/home/Brand/Colors.txt` | D−4 days | below |
| `/home/Clients` | | folder |
| `/home/Clients/Brightpath.txt` | D−14 days | below |
| `/home/Clients/Northwind.txt` | D−6 days | below |
| `/home/Photos` | | folder |
| `/home/Photos/Harbor.jpg` | D−21 days | one photo, a few hundred KB |
| `/home/Notes.md` | D−2 days | below |
| `/home/Roadmap.md` | D−8 days | below |

`Harbor.jpg` is a real photo, so Photos shows a size in the hundreds of KB. On the first login, `GET` one jpeg from `/home/Pictures` and `POST` it to `/home/Photos/Harbor.jpg` with the mtime above, then delete Pictures. The Cloudron image adds Pictures. The git skeleton does not. Name the copy `Harbor.jpg`. On a retake Pictures is already gone, so `POST` that same jpeg again.

The word Brightpath appears in the filename `Brightpath.txt` and in the body of `Homepage.md`. It appears nowhere else. Search is full-text, and the dropdown shows the filename, not a snippet.

`Logo.md`:

```markdown
# Logo

Use the mark on a light background. Leave clear space equal to the height of the mark.

Do not recolor the mark.
```

`Colors.txt`:

```text
Colors

Blue   #1a73e8
Navy   #0a2e4c
White  #ffffff
```

`Brightpath.txt`:

```text
Brightpath Studio

Design review in December.
Contact: Maya Chen
```

`Northwind.txt`:

```text
Northwind

Renewal call on November 12.
Contact: Priya Nair
```

`Roadmap.md`:

```markdown
# Roadmap

The November release is the public launch. December is polish and support.

## Goals

- Ship the file sharing updates Maya Chen signed off
- Move support replies to the new macros
- Keep the press kit internal until November 18

## November

- November 3 — homepage copy freeze
- November 12 — Northwind renewal call
- November 18 — public launch

## December

- Support queue review with Priya Nair
- Close the follow-ups from the summit

## Owners

- Design — Maya Chen
- Support — Priya Nair
- Roadmap — Alex Chen
```

`Notes.md`:

```markdown
# Notes

Met Maya Chen after the product talk. She wants the homepage to name the November release and nothing earlier.

## Decisions

- Press kit stays internal until November 18
- Follow-up dinner on November 12

## Follow-ups

- Send Maya the Brand folder
- Priya Nair drafts the support macros before December
```

The root list is Brand, Clients, Photos, Notes.md, Roadmap.md. Brand shows 4 days ago, Clients shows 6 days ago, and Photos shows 3 weeks ago.

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

| Path | mtime | Contents |
|---|---|---|
| `/groupfolders/design/Homepage.md` | D−8 days | below |
| `/groupfolders/design/Launch.txt` | D−21 days | below |
| `/groupfolders/design/Posts.txt` | D−14 days | below |

`Homepage.md`:

```markdown
# Homepage

The November release is the public launch.

## Footer

Brightpath Studio reviews the homepage before November 3.

Copy freeze November 3.
```

`Launch.txt`:

```text
Launch checklist

- Homepage copy frozen November 3
- Northwind renewal confirmed
- Public launch November 18
```

`Posts.txt`:

```text
Social posts

November 3 — Copy freeze. Homepage stays as reviewed.
November 12 — Northwind renewal call.
November 18 — Public launch.
```

The folder list is Homepage.md, Launch.txt, Posts.txt.

**Sharing.** Two shares on `/Notes.md`, owned by the signed-in user.

- The second user, Read & write. Do not `POST /api/v1/shares` with `receiverUsername` or `receiverEmail`. That sends a "shared a file with you" email. Insert the row in `shares`: `id` is `sid-` plus 64 hex characters, `owner_username` is the signed-in user, `owner_groupfolder` is null, `file_path` is `/Notes.md`, `receiver_username` is the second user, `receiver_email` and `receiver_group` are null, `readonly` is 0, `expires_at` and `password_hash` are null.
- One public link, Read only, no password, no expiry. This one does not mail anyone. `POST /api/v1/shares` with `{ "ownerUsername": "<you>", "path": "/Notes.md", "readonly": true }` and no receiver.

The Share dialog puts users and links on separate tabs. `share.png` is the user tab. The link is still created. The preview panel on `Notes.md` lists both: the second username, and `link`.

**Search.** `Brightpath` is the filename of `Clients/Brightpath.txt` and a word in the body of `Homepage.md` (Design). It is not in any other file. File writes schedule a recoll index about 10 seconds later. Wait until `GET /api/v1/search?query=*Brightpath*` returns those two files before opening the dropdown. The search field ignores typing until it is focused, then waits 500ms.

## Take the shots

1. Confirm `devicePixelRatio` is 2 and the Chrome window is 1280×800. List view. Preview panel visible. The sidebar starts at My files.
2. Files: `#files/home/`. Brand, Clients, Photos, Notes.md, Roadmap.md. Select Notes.md. The Details tab shows the name and Shared with (the second username, and `link`).
3. Markdown: open `Roadmap.md`. Hover `.document-outline` so the outline lists Goals, November, December, and Owners. The title is in frame.
4. Search: from My files, focus the top bar, type `Brightpath`, and wait until the dropdown lists Brightpath.txt under My files and Homepage.md under Design. Do not click the backdrop. Clip `.container` while the panel is open.
5. Share: open the Share dialog on Notes.md. The user tab shows the second username as Read & write. Clip the dialog.
6. Group folder: `#files/groupfolders/design/`. Homepage.md, Launch.txt, Posts.txt. Select Homepage.md. Sidebar on Group folders.
7. WebDAV: `#settings`, on the Cloudron install. The WebDAV section shows `https://cubby-demo.smartserver.io/webdav/<username>/` and the username. Clip `.container` with those fields in frame.

Write each PNG under `screenshots/`. Check the bitmap is 2× the CSS clip before keeping it.
