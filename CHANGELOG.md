# Changelog

## 0.10.0 — 2026-10-05

- Drive file changes: once a day, after a full sync with a valid token, the app lists every EPUB
  and PDF in Drive (a few requests, whatever the library size) and compares it with the library.
  - A book Drive no longer lists (deleted, trashed, access lost) shows **Missing in Drive**; a
    downloaded copy still opens.
  - A downloaded book whose file changed shows **New version**; the reader offers "Get it", which
    replaces the download and keeps the position (falling back to the fraction if needed).
  - Books not downloaded just take the new checksum; a listing that may be cut short (5000
    files) marks nothing missing; a failed check never fails the sync.
- Events `drive.checked` and `drive.check_failed`.
- Tests: fast-check properties for the comparison; e2e for both cases against the fake Drive
  (which can now delete or replace a file).

## 0.9.0 — 2026-10-05

- Library: a **Downloaded** view (shown once a Drive book is on the device, or at
  `/?show=downloaded`) lists Drive books stored here with their size, largest first. "Remove
  download" deletes the file only: the book, its cover and reading position stay, and it
  downloads again on open. Books opened from this device are not listed (their file is the only
  copy).
- Reader: "Not enough space" now has a **Free space** button that opens that view.
- Event `library.download_removed` (`format`, `bytes`).

## 0.8.5 — 2026-10-05

- Phone library: the 64 px Continue cover (for books without a cover image) shows the title
  only, in a smaller size, as on the design canvas; the author stays beside it. From the `sm`
  breakpoint up the 96 px cover is unchanged.

## 0.8.4 — 2026-10-05

- Internal: dropped the `idb` package (no release since May 2025). `src/services/storage/idb.ts`
  holds the three helpers `db.ts` needs over raw IndexedDB (`openDatabase`, `request`, `done`);
  an open connection now closes itself when another tab upgrades the database.
- Tests: before removal, 200 random operation sequences gave identical results from the old and
  new implementations. A model-based property test (`db.model.test.ts`, fast-check) now checks the
  store against an in-memory model.

## 0.8.3 — 2026-10-05

- Docs: `docs/ARCHITECTURE.md` (renamed from `Ebook Reader Architecture.md`) rewritten as built,
  with Mermaid diagrams for system context, sign-in, book pipeline, sync decisions, updates,
  observability and deployment. No code changes.

## 0.8.2 — 2026-10-05

- Fix: Reload on the update notice did nothing on the owner's phone (logs: six taps, same
  session kept running the old version). The app now sends SKIP_WAITING to the waiting worker
  itself and reloads on activation, on controller change, at once if nothing is waiting (an
  earlier tap already activated it, leaving a stale notice), or after 4 s at the latest.
- Diagnostics: `pwa.update_applied` records whether a worker was waiting and the page was
  controlled; `pwa.reloading` records what triggered the reload; `app.started` adds a coarse
  `browser` family (e.g. `ios-safari`, `android-chrome`).

## 0.8.1 — 2026-10-05

- Update toast: after tapping Reload it says "Updating…" and ignores further taps (production
  logs showed three taps during a ~20 s activation on a phone).

## 0.8.0 — 2026-10-05

Build step 7, hardening (first pass), guided by the first production logs.

- Wake lock (owner task): the screen stays on while a book is open, sleeps after 5 minutes
  without a page turn, and comes back on the next one; released when leaving the book.
- Reading sessions count active time: gaps between page turns are capped at 5 minutes (logs
  showed 104-minute sessions with no pages).
- Vue render and handler errors are logged (`error.uncaught`, source `vue:…`); the browser's
  harmless "ResizeObserver loop" notice is no longer reported as a crash.
- Books whose file the browser deleted under storage pressure go back to "Drive only" at start
  (`storage.evicted`).
- Offline: Drive books not on this device are dimmed and say "Not downloaded".
- Library footer shows the space used on this device.
- E2E: offline cold start from the service-worker cache (downloaded book opens, others marked),
  and an interrupted download that is retried successfully.

## 0.7.1 — 2026-10-05

Fixes found in the first production logs.

- Accounts connected before v0.7.0 were never identified (`user_id` missing): the account is now
  identified on start when a token is kept but no user id is recorded.
- `reading.session` counted layout reports (address bar, rotation) as pages: a page now counts
  only when the position changes.
- `connect()` waits for identification, so identity is settled when it returns.

## 0.7.0 — 2026-10-05

Observability and measurability (OBSERVABILITY.md).

- Pseudonymous identity on every log event: `device` (random per-browser id and kind) and,
  after connecting Drive, `user_id` (SHA-256 of the Drive permission id; never the email).
- Typed event catalogue (`src/services/events.ts`): app start timing, Drive connect and expiry,
  imports and removals, book open time and failures, downloads, reading sessions (minutes,
  pages, from → to; sent on close and when the tab is hidden), Drive listings, sync results
  and failures, storage persistence and usage, PWA update and install funnels, uncaught
  errors and CSP violations (origin or kind only).
- Fix: `sync.failed` and other `.failed` events were logged at info level.

## 0.6.1 — 2026-10-05

- Deployment: `deploy.toml` (static SPA, drive-read.mlnkv.net), Dockerfile (bun build → Caddy),
  `.dockerignore` (no `.env`). The container's Caddyfile is generated from `csp.ts`
  (`scripts/caddyfile.ts`): CSP and security headers, `no-cache` for everything outside
  `/assets/` (index.html, sw.js, manifest: updates arrive), `immutable` for hashed assets,
  SPA fallback. The logger ingest key stays out of git (server compose and `.env` only).

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
