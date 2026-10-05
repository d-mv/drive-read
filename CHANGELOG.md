# Changelog

## 0.6.0 — 2026-10-05

Build step 8: installable PWA with reliable updates.

- Install: PNG icons (192, 512, maskable 512) and an Apple touch icon rendered from icon.svg
  (`bun run icons`), iOS meta tags, manifest `id`. "Install app" where the browser offers it;
  an "Add to Home Screen" hint in iOS Safari. The library footer shows the version.
- Updates: checks on start, when the tab is shown again, when back online, and hourly while
  open. "A new version is ready. Reload" appears app-wide, the reader included, and never reloads
  on its own; Reload returns to the same book and page. One-time "Updated to vX" afterwards;
  "Ready to work offline" after the first install.
- E2E test of the real update flow: build v1 and v2, swap them under a running page, check the
  offer, reload, and confirm the version, book and position.
- The CSP lives in `csp.ts`, shared by `vite preview` and the update test's server.

## 0.5.0 — 2026-10-05

Build step 6: PDF.

- PDF engine on pdf.js 6 (`pdfjs-dist`, Apache-2.0) behind the same `BookEngine` interface,
  loaded as a lazy chunk; its worker is served from the app origin (CSP unchanged, no violations).
- Pages render to a canvas fitted to the reading width (Margins set the width); a tall page
  scrolls before the next turns; Back lands at the bottom of the previous page; swipe on touch.
  Position is page + offset; contents come from the PDF outline; title/author from its metadata;
  the cover is page 1. Dark mode changes only the surround: pages keep their colours.
- Reader footer shows "Page 3 of 120"; text settings for a PDF offer only Margins and Theme.
- PDFs can be added from Drive (no more "PDF later") or from the device, and open from the OS.
- Both engines are precached, so books of either format open offline.

## 0.4.0 — 2026-10-05

Build step 5: sync through the Drive app folder.

- Reading positions (`progress-<fileId>.json`) and the library (`library.json`) sync between
  devices. Writes stay local first; Drive gets them 20 s after the last page turn, when the tab
  is hidden (keepalive), and on "Sync now". Pulls run on app start, book open, back online and
  after (re)connecting. A cross-tab lock keeps two tabs from syncing at once.
- Conflict rule: only a real conflict (Drive changed since last seen *and* local changes
  waiting) compares times; the later write wins and the other position is offered once. A newer
  position for the open book is offered ("Jump to 61%, read on Phone yesterday 23:10?"), never
  applied under the reader.
- Library: removals are markers, so another device does not add a removed book back; books added
  elsewhere appear as "Drive only". "Continue reading" follows the latest position from any
  device, with "Last read on Phone, …". Header shows "Synced 14:02" (click to sync now);
  notices for waiting changes when offline or disconnected.
- Books opened from a local file stay on this device (not synced).
- IndexedDB v2: `meta` store for sync state (migration keeps v1 data).
- Fix: updated book records (downloaded flag, real title/contents, opened time) failed to save
  ("book record not saved" in the log): reactive proxies cannot be cloned into IndexedDB.
- Unit tests no longer send events to the production logger.

## 0.3.0 — 2026-10-05

- "Add from Drive" has no "All books" view any more: it opens on My Drive and browses folders.
  The search box shows matching books while it has text; "Back to folders" (or clearing it)
  returns to the same folder.
- Folders and books are sorted alphabetically by the name shown (author folders by "Mark Dawson",
  not `dawson,-mark`; books by title), ignoring case and accents, numbers in natural order.
  Folders come first.

## 0.2.1 — 2026-10-05

- Fix: browsing folders could show books from all of Drive. The first "All books" listing (several
  pages for a large Drive) could answer after the user had moved to a folder and overwrite it;
  the same race applied between quickly clicked folders. Only the latest listing may now update
  the screen.
- Each Drive listing is logged (kind, duration, file count, whether it was stale).

## 0.2.0 — 2026-10-04

Build step 4: books from Google Drive (Drive API, `drive.readonly` + `drive.appdata`, no Picker).

- Connect Google Drive (Google Identity Services token model, loaded on first use). The token
  lives in memory and sessionStorage; an expired token shows "Reconnect Drive", never blocks reading.
- "Add from Drive" screen: search all EPUB/PDF in Drive, browse folders with a breadcrumb,
  multi-select, add a whole folder at any depth (Calibre author folders). Titles and authors are
  read from file names ("Last, First. Title", "Title - Author"); author folders like
  `dawson,-mark` show as "Mark Dawson".
- Drive books are registered without downloading; the file streams into OPFS on first open with
  a progress bar, then the book's real metadata replaces the file-name guess. A file the browser
  evicted downloads again.
- Library: "Add from Drive" button, "Drive only" status. Reader errors for reconnect, offline,
  missing in Drive, failed download and full storage, each with its fix.
- E2E tests run the whole flow against a faked Google (`e2e/fake-google.ts`) under the real CSP.

## 0.1.2 — 2026-10-04

- Logging live: `drive-read` registered with logger-api (ingest key in `.env`, CORS for
  `https://drive-read.mlnkv.net`, `localhost:5173` and `localhost:4173`). Verified from the app.
- E2E builds run with an empty ingest key, so test runs never write to the production log.

## 0.1.1 — 2026-10-04

- No Google Picker: the CSP drops `apis.google.com` (script-src) and `docs.google.com` (frame-src).
- `.env.example`: only `VITE_GOOGLE_CLIENT_ID` for Google; no API key, app ID or client secret.
- Drive access spike rewritten for the Drive API with `drive.readonly` (folder browser, book search).

## 0.1.0 — 2026-10-04

First build: steps 1–3 of the architecture doc (shell, local reader, library). No Google Drive yet.

- Shell: Vite 8, Vue 3.5, Pinia 4, Vue Router 5, Tailwind 4 semantic tokens (light and dark),
  self-hosted Literata, Space Grotesk and IBM Plex Mono, pre-paint theme script, PWA with an
  "Update available" prompt, file handler for `.epub`.
- Reader: EPUB through foliate-js (vendored submodule) behind the `BookEngine` interface;
  chapter-segmented progress bar, contents panel (J/K/Enter/Esc), text settings (typeface, size,
  line spacing, margins, alignment, theme), keyboard paging, swipe on touch.
- Library: open EPUB files from this device into OPFS, covers, Continue row, filters with counts,
  search, sort, grid and list, remove. Reading position saved to IndexedDB on every page turn.
- Logger API client (batched, fire-and-forget); sends nothing until an ingest key is set.
- The production CSP is served by `vite preview`; an e2e test proves a script inside a book does not run.
