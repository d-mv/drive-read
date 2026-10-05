# Ebook Reader: Architecture

Oct 4, 2026 · @Dmitry

## Scope

A static, client-only PWA that reads EPUB and PDF files from the user's Google Drive, keeps them on the device for offline reading, and syncs reading position through Drive. There is no backend: Google is the only remote party.

**Goals**

- An opened book stays readable with no network and no valid token.
- Reading position follows the user across devices.
- Keyboard-first on desktop, touch on phone, light and dark themes.
- Few dependencies; native browser APIs where they exist.

**Not in v1**

- Files with DRM.
- Highlights and notes (the sync record leaves room for them).
- Formats beyond EPUB and PDF.
- Storage providers other than Google Drive.

**Constraints that shape the design**

| Constraint | Consequence |
| --- | --- |
| Browser-only OAuth returns short-lived access tokens and no refresh token | Sync must tolerate an expired token; reading never depends on one |
| Book content renders in an isolated frame | App CSS does not reach it; themes are injected into the renderer |
| Browser storage is per-origin and can be evicted | Local data is a cache that can be rebuilt from Drive; the app asks for persistent storage |
| Reflowable text has no fixed pages | Position is stored as a content pointer (CFI), not a page number |

## System context

&#91;embedded content: system context · browser layers and three remote parties\]

Views call stores, stores call services, and only the Drive and auth service talks to Google. Book files and records stay in browser storage; the static host only delivers the app shell.

## Module structure

Four layers, each importing only from the one below: views, stores, services, and vendored engines. Services are plain TypeScript with no Vue imports, so they can be tested without a DOM.

```text
src/
  app/          main.ts, router.ts, App.vue, keymap.ts
  views/        LibraryView.vue, ReaderView.vue, ConnectView.vue
  components/   BookCard, ContinueRow, ProgressSegments,
                ContentsPanel, TextSettings, SyncNotice
  stores/       auth.ts, library.ts, reader.ts, sync.ts, settings.ts
  services/
    auth/       gis.ts            token client, expiry tracking
    drive/      client.ts         fetch wrapper, 401 handling
                files.ts          metadata, download
                appdata.ts        progress and library records
                picker.ts         Google Picker
    storage/    db.ts             IndexedDB through idb
                blobs.worker.ts   OPFS reads and writes
    engine/     types.ts          BookEngine interface
                epub.ts           foliate-js adapter
                pdf.ts            pdf.js adapter
    sync/       queue.ts, merge.ts
  styles/       tokens.css, reader-theme.ts
  sw.ts
vendor/foliate-js/                git submodule
```

| Layer | Owns | Does not |
| --- | --- | --- |
| Views and components | Layout, input, the keymap | Call `fetch` or touch storage |
| Stores (Pinia) | App state and orchestration | Touch the DOM |
| Services | All IO: Drive, auth, IndexedDB, OPFS | Hold UI state |
| Engines | Parsing, pagination, rendering inside their own frame | Know about Drive or stores |

Both formats sit behind one interface, so the reader view and the sync code never branch on format:

```ts
interface BookEngine {
  open(file: File): Promise<BookMeta>
  mount(el: HTMLElement, at?: Locator): Promise<void>
  next(): void
  prev(): void
  goTo(loc: Locator): Promise<void>
  setTheme(theme: ReaderTheme): void
  onRelocate(cb: (pos: Position) => void): void
  destroy(): void
}

type Locator =
  | { kind: 'cfi'; cfi: string }
  | { kind: 'page'; page: number; offset: number }

interface Position {
  locator: Locator
  fraction: number         // 0..1 through the book
  chapterIndex: number
  chapterFraction: number  // 0..1 through the chapter
}

interface BookMeta {
  title: string
  author: string
  cover?: Blob
  toc: { label: string; locator: Locator; start: number }[]
}
```

`toc[].start` is each chapter's starting fraction. The segmented progress bar and the contents panel both draw from it.

## Data model and storage

Local storage is the source of truth for the UI; Drive holds only what must reach other devices. The Drive file ID is the key for a book everywhere.

| Where | What | Key | Leaves the device |
| --- | --- | --- | --- |
| IndexedDB `books` | Title, author, format, size, md5, table of contents, download state | `fileId` | Via `library.json` (identity only) |
| IndexedDB `progress` | Locator, fraction, `updatedAt`, device, `dirty` flag, remote record ID | `fileId` | Yes, one record per book |
| IndexedDB `settings` | Theme, typeface, size, line spacing, margins, device ID and name | fixed keys | No |
| OPFS `/books/<fileId>` | The book file as downloaded | path | No (Drive already has it) |
| OPFS `/covers/<fileId>` | Cover image extracted on first open | path | No |
| Drive `appDataFolder` | `library.json` and `progress-<fileId>.json` | file name | n/a |

**Progress record** (the same shape locally and in Drive, minus the local-only `dirty` flag):

```json
{
  "v": 1,
  "fileId": "1AbC...",
  "md5": "9e107d...",
  "locator": { "kind": "cfi", "cfi": "epubcfi(/6/14!/4/2/18/1:132)" },
  "fraction": 0.42,
  "updatedAt": "2026-10-04T15:12:09Z",
  "device": { "id": "k3f9", "name": "Laptop" },
  "bookmarks": []
}
```

**Library record** (`library.json`): a list of `{ fileId, md5, name, addedAt, updatedAt, removed }`. Removal sets `removed: true` instead of deleting the entry, so a second device does not add the book back on merge.

Notes:

- `md5` comes from Drive's file metadata. It re-matches progress when the same file is uploaded again under a new ID.
- OPFS writes go through a worker using a sync access handle, the form every engine supports.
- After the first download the app calls `navigator.storage.persist()`. Settings shows usage from `navigator.storage.estimate()`.
- Every record carries `v`. IndexedDB migrations run in the `idb` upgrade callback.

## Auth and Drive access

The app requests two non-sensitive scopes, `drive.file` and `drive.appdata`, through Google Identity Services' token model. A new access token always needs a user gesture, which is the main limit on background sync.

| Scope | Gives the app | Google's tier |
| --- | --- | --- |
| `drive.file` | Files the user picks in the Google Picker | Non-sensitive |
| `drive.appdata` | A hidden per-app folder for the sync records | Non-sensitive |
| `drive.readonly` (alternative) | Every file and folder, so the app can browse | Restricted |

Scope tiers are from [Choose Google Drive API scopes](https://developers.google.com/drive/api/guides/api-specific-auth).

**Token lifecycle**

1. `ConnectView` calls `requestAccessToken()` from the button tap. Google returns an access token and its lifetime.
2. `auth` store keeps the token and expiry in memory and in `sessionStorage`, so a reload inside the lifetime needs no prompt.
3. `drive/client.ts` attaches the token to every request. A 401 or a passed expiry sets `auth.state = 'expired'` and rejects with a typed error.
4. The sync queue pauses on `expired`. The UI shows one notice with a Reconnect button; that tap requests a new token.
5. Any other Drive action the user starts (Add from Drive, Sync now) requests a token first if needed, since it is already a gesture.

The implicit flow issues no refresh token and needs a gesture for each new access token, per [Choose a user authorization model](https://developers.google.com/identity/oauth2/web/guides/choose-authorization-model). So on a cold start with an expired token, the app opens at the local position and cannot pull a newer one until the user taps.

**Calls the app makes**

| Purpose | Call |
| --- | --- |
| File metadata | `GET /drive/v3/files/{id}?fields=id,name,mimeType,size,md5Checksum,modifiedTime` |
| Download a book | `GET /drive/v3/files/{id}?alt=media` |
| List sync records | `GET /drive/v3/files?spaces=appDataFolder&fields=files(id,name,modifiedTime)` |
| Read a sync record | `GET /drive/v3/files/{id}?alt=media` |
| Create a sync record | `POST /upload/drive/v3/files?uploadType=multipart` with `parents: ['appDataFolder']` |
| Update a sync record | `PATCH /upload/drive/v3/files/{id}?uploadType=media` |

No `gapi` client: plain `fetch`, one wrapper, typed errors (`AuthExpired`, `Offline`, `NotFound`, `RateLimited`).

## Book pipeline

A book goes from Drive to a rendered page in six steps, and only the first three need the network.

1. **Pick.** The Google Picker opens, filtered to `application/epub+zip` and `application/pdf`. It returns file IDs the app may now read.
2. **Register.** `drive/files.ts` fetches metadata. The `library` store writes a `books` record with `downloaded: false` and adds the entry to `library.json`.
3. **Download.** On first open, the file streams from `alt=media` into the OPFS worker with a progress readout. A failed stream deletes the partial file.
4. **Open.** The `reader` store takes a `File` from OPFS and hands it to the engine chosen by format. On first open it saves title, author, cover, and table of contents from `BookMeta`.
5. **Restore.** The store reads the local `progress` record and calls `engine.mount(el, locator)`.
6. **Read.** Each `onRelocate` updates the store, writes `progress` to IndexedDB, and nudges the sync queue.

**Engines**

| Format | Library | Notes |
| --- | --- | --- |
| EPUB | [foliate-js](https://github.com/johnfactotum/foliate-js), vendored at a pinned commit | Its README calls the API not stable, so `engine/epub.ts` is the only file that imports it. It needs a zip library; the README recommends zip.js. |
| PDF | `pdfjs-dist`, loaded as a lazy chunk | Rendered to canvas. The locator is page plus scroll offset. foliate-js has a PDF adapter, but its README marks it experimental. |

EPUB files can contain scripts. The page's Content-Security-Policy must stop book content from running them; the policy is in Deployment.

## Progress sync

Progress is written locally on every page turn and pushed to Drive when the reader goes idle, with the latest write winning per book. Nothing polls: sync runs only on the events below.

| Event | Action |
| --- | --- |
| Page turn | Write `progress` to IndexedDB, set `dirty`, restart a 20 second idle timer |
| Idle timer fires | Push dirty records |
| Tab hidden (`visibilitychange`) | Push now, using `fetch` with `keepalive: true` |
| App start, book open, back online, token renewed | Pull: list the app-data folder, fetch records changed since the last pull |
| Sync now | Pull, then push |

&#91;embedded content: push flow · two checks before a write\]

A record that cannot be pushed stays dirty and goes out on the next trigger. When both sides changed, the rule below decides.

**Conflict rule**

A conflict exists only when the remote record changed since this device last saw it and the local record is dirty. The later `updatedAt` wins, and the reader offers the other position once ("Jump to 61%, read on Phone at 23:10?").

Without a conflict the newer side is adopted silently. If the book is open and the remote position replaces the local one, the reader asks before moving the page.

**Details**

- Each local record stores the Drive `modifiedTime` it last saw. Comparing against that server timestamp detects remote change without trusting device clocks.
- Latest write wins, not furthest position: flipping back to re-read must not be undone by sync.
- A push that fails (offline, expired token, rate limit) leaves the record dirty. The next trigger retries.
- `navigator.locks` guards the queue, so two tabs never push at once.
- `library.json` merges per entry by `updatedAt`. Bookmarks, when they arrive, merge per item by ID with removal markers.

## Offline and the service worker

The service worker caches only the app shell; books and sync records never pass through it. That keeps the worker small and makes storage use visible in one place, OPFS.

| What | Where | Strategy |
| --- | --- | --- |
| HTML, JS, CSS, fonts, icons | Cache Storage, Workbox precache | Precached, versioned by build hash |
| Engine chunks (foliate-js, pdf.js and its worker) | Cache Storage | Precached, so both formats open offline |
| Book files and covers | OPFS | Written by the app |
| Drive API responses | Not cached | Network only |
| Google Identity script | Not cached | Loaded on demand, only when a token is needed |

The app must start with no network and no Google script. `auth/gis.ts` injects the script the first time a token is requested, never at boot.

**Updates.** `vite-plugin-pwa` runs in prompt mode: a new worker waits, and the library shows an "Update available" notice. The app never reloads on its own while a book is open.

**Manifest.** `display: standalone`, a theme colour for each colour scheme, and `file_handlers` for `.epub` and `.pdf` where the browser supports it.

**Local files.** "Open a file from this device" copies the file into OPFS under a `local-<md5>` key. It behaves like any other book; whether its progress syncs is an open decision.

## Theming

One set of semantic tokens drives both the app chrome and the book content; dark mode swaps token values, so components rarely need a `dark:` variant. The values below are the ones on the design canvas.

```css
/* styles/tokens.css */
@import "tailwindcss";

@theme {
  --color-paper: #F3F0E8;   /* ground */
  --color-panel: #E9E5DA;   /* side panels, notices */
  --color-ink: #1C1B19;     /* text, selected controls */
  --color-ink2: #5C5850;    /* secondary text */
  --color-rule: #CCC6B8;    /* hairlines */
  --color-track: #ADA695;   /* unread part of a progress bar */
  --color-signal: #D9480F;  /* reading progress, nothing else */

  --font-ui: "Space Grotesk", system-ui, sans-serif;
  --font-mono: "IBM Plex Mono", ui-monospace, monospace;
  --font-read: "Literata", Georgia, serif;
}

[data-theme="dark"] {
  --color-paper: #171614;
  --color-panel: #1F1E1B;
  --color-ink: #E6E2D8;
  --color-ink2: #A39E92;
  --color-rule: #383630;
  --color-track: #565248;
  --color-signal: #F0672A;
  color-scheme: dark;
}
```

**Choosing the theme.** The setting is `system`, `light`, or `dark`. A small blocking script in `<head>` resolves it and sets `data-theme` before first paint, reading a `localStorage` mirror because IndexedDB is asynchronous. It is an external file, so the Content-Security-Policy needs no inline-script allowance. The same code updates `<meta name="theme-color">`.

**Book content.** `styles/reader-theme.ts` reads the resolved token values, combines them with the text settings (typeface, size, line spacing, margins, alignment), and returns a CSS string. `engine.setTheme()` injects it into the renderer and runs again on any theme or setting change.

**PDF.** Pages keep their own colours. Dark mode changes only the surround.

**Fonts.** All three families are self-hosted as `woff2` and precached. The "Original" typeface option injects no font override, so the publisher's fonts show.

## Failure states

No failure blocks reading a book that is already on the device. Each one shows a single notice or row state, and the UI shows status only when something is wrong.

| Situation | Detected by | The user sees | Recovery |
| --- | --- | --- | --- |
| Token expired | 401 or passed expiry | "Reconnect Drive to sync" notice | Tap Reconnect |
| Sign-in popup blocked or closed | GIS error callback | Inline message on the Connect or Reconnect button | Allow popups, tap again |
| Offline | `offline` event or a failed fetch | Notice with the count of positions waiting | Automatic on `online` |
| Book not downloaded while offline | `downloaded: false` | Row dimmed, "Not downloaded" | Opens once online |
| Download interrupted | Stream error | Row shows Retry; partial file removed | Tap Retry |
| File deleted or access lost in Drive | 404 or 403 on metadata | "Missing in Drive" on the row; the local copy still opens | Remove, or pick it again |
| File replaced in Drive | `md5` differs on pull | Offer to download the new version | Position falls back to `fraction` if the CFI no longer resolves |
| Protected or damaged file | `engine.open` throws | "This file can't be opened. It may be protected or damaged." | None |
| Storage full | `QuotaExceededError` | "Not enough space", with a link to downloaded books | Remove downloads |
| Storage evicted by the browser | Record says downloaded, OPFS file missing | Row returns to "Drive only" | Downloads again on open |

## Deployment

`vite build` produces a static `dist/` served by Caddy on its own subdomain. The app needs its own origin because service worker scope, storage, and the OAuth authorized origin are all per-origin.

**Caddy**

- `index.html` and `sw.js`: `Cache-Control: no-cache`, so updates are seen.
- Hashed assets: `Cache-Control: public, max-age=31536000, immutable`.
- SPA fallback to `index.html`.
- A Content-Security-Policy header. The one below is an untested starting point; tighten it against console errors.

```text
default-src 'self';
script-src 'self' https://accounts.google.com https://apis.google.com;
connect-src 'self' https://www.googleapis.com https://accounts.google.com;
frame-src blob: https://accounts.google.com https://docs.google.com;
img-src 'self' blob: data:;
style-src 'self' 'unsafe-inline' blob:;
font-src 'self' blob: data:;
worker-src 'self' blob:
```

The property that matters: `script-src` allows neither `blob:` nor `'unsafe-inline'`, so a script inside a book cannot run.

**Google Cloud**

1. Create a project. Enable the Drive API and the Picker API.
2. Configure the OAuth consent screen with the two scopes. Both are non-sensitive.
3. Create an OAuth client ID of type Web. Authorized JavaScript origins: the production subdomain and `http://localhost:5173`.
4. Create an API key for the Picker, restricted to the same origins.
5. Build-time config: `VITE_GOOGLE_CLIENT_ID`, `VITE_GOOGLE_API_KEY`, `VITE_GOOGLE_APP_ID` (the project number, which the Picker needs to grant `drive.file` access).

None of these values is a secret; they ship in the bundle.

## Open decisions

| Decision | Default in this doc | Alternative and what it costs |
| --- | --- | --- |
| Drive scope | `drive.file` with the Picker | `drive.readonly` allows folder browsing and import, but is a restricted scope: fine for personal use behind the unverified-app screen, heavy to publish |
| Token renewal | Client-only; a tap to reconnect when the token has expired | A small code-flow endpoint on the VPS holding a refresh token gives silent sync, but adds a backend and a secret |
| EPUB engine | foliate-js, vendored | epub.js installs from npm but sees little maintenance |
| Local files | Stored like any book | Sync their progress by md5, or keep it on the device |
| App name | Not chosen | The UI shows a placeholder |

To verify before building on them:

- [ ] Whether picking a folder under `drive.file` grants access to the files inside it. The first-run copy says "a whole folder" and depends on this.
- [ ] That the Google sign-in popup works inside an installed PWA on Android.
- [ ] The Content-Security-Policy against the Picker and the EPUB renderer.

## Build order

Each step ends with something usable.

1. **Shell.** Vite, Vue, Tailwind tokens, router, theme switch, manifest, service worker.
2. **Reader, local only.** Open a local EPUB through the engine adapter. Text settings, keymap, progress in IndexedDB.
3. **Library.** `books` store, OPFS worker, covers, grid and list.
4. **Drive in.** Token client, Picker, metadata, download.
5. **Sync.** App-data records, queue, merge, notices.
6. **PDF engine.**
7. **Hardening.** Failure states, storage persistence, update flow, a pass on an Android phone.
