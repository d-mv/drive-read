# Changelog

## 0.23.5 — 2026-10-22

- Books larger than 200 MB are refused before any parsing: at import ("larger than 200 MB, the most Drive Read opens"), before a Drive download (by Drive's size, and the download stops if more arrives), and when opening a stored file. A crafted archive or PDF could otherwise exhaust the tab's memory. Inner limits on decompression would need changes to foliate-js and are not made.

## 0.23.4 — 2026-10-22

- Logs: `error.uncaught` sends the kind of error (`TypeError`, `QuotaExceededError`…) and where it happened, never the message, which could quote a book's text or a file name. The pseudonymous user id is now a salted hash of the Drive permission id, so it can't be matched with a plain hash of a known id. User ids in the logs change once; a device that stored the old id is still recognised as the same account when it reconnects.

## 0.23.3 — 2026-10-22

- Sync is stricter about what other devices wrote. A `progress-<id>.json` whose record names another book is ignored (before, it overwrote that book's position), and only known fields are stored. Library and progress records need a Drive-style id, ISO timestamps (a value like `\uffff` used to win every later merge), a fraction from 0 to 1, and a non-negative whole page with an offset from 0 to 1.

## 0.23.2 — 2026-10-22

- Security (ops): `.DS_Store` files are kept out of the Docker build context at any depth (`**/.DS_Store`). A Finder `public/.DS_Store` was being served at `/.DS_Store`, listing the names in `public/`. `scripts/check-build-args.sh` now requires the server's known host key (`StrictHostKeyChecking=yes`) before it sends the password.

## 0.23.1 — 2026-10-22

- Fix: a Google token response without `expires_in` is taken to last Google's usual hour. Before, it counted as already expired while Connect reported success.

## 0.23.0 — 2026-10-22

- Connecting a different Google account on a device that used another one now asks first. If you continue, the books and reading positions of the other account are removed from this device before the new token is used, so nothing of one account is synced into the other's Drive app folder (it stays in the old account's Drive). If you cancel, nothing changes and the new token is dropped. Before, both libraries were silently merged and pushed into both accounts. Logged as `auth.account_switch`. A reader that reconnects as another account while a book is open returns to the library.

## 0.22.7 — 2026-10-22

- Security (tooling): vite 8.3.2 → 8.3.5, which fixes six `bun audit` advisories in the dev server (files outside `server.fs.allow`, the `?vite-wasm-instance` byte leak, cross-origin script through custom middleware, and launch-editor). None of them reached the built site. The remaining advisory (sprintf-js via Electron's download tooling, denial of service only) waits for an upstream release.

## 0.22.6 — 2026-10-22

- Security: books reach only the foliate-js readers the app offers (EPUB, FB2). An EPUB goes in as `book.epub` and must be a zip, and an FB2 with Kindle bytes is refused, so a Kindle (MOBI) file or a comic archive (CBZ) named as a book no longer opens through foliate's MOBI or CBZ readers. These readers were never reviewed for this app. Such files now report as unreadable.

## 0.22.5 — 2026-10-22

- Security: the app container's Caddy sends `Strict-Transport-Security: max-age=31536000` and `Cross-Origin-Opener-Policy: same-origin-allow-popups`. The front proxy already redirects HTTP to HTTPS, but sent neither header.

## 0.22.4 — 2026-10-22

- Security (desktop): Electron fuses are set in `electron-builder.yml`. The packaged app ignores `ELECTRON_RUN_AS_NODE`, `NODE_OPTIONS` and `--inspect`, loads only an integrity-checked `app.asar`, and drops the `file://` extra privileges. Another process can no longer run its own code as Drive Read and use its macOS folder permissions. `DR_DIST` and `DR_USER_DATA` now work only in dev and test runs (`desktop/overrides.ts`, unit-tested), and DevTools are off in the packaged app. Checked on a built `.app`: fuse wire read back, the app launches with asar integrity on, and `ELECTRON_RUN_AS_NODE=1` no longer runs code.

## 0.22.3 — 2026-10-22

- Security: the CSP allows Google for the sign-in script only (`https://accounts.google.com/gsi/client`), not the whole host. Book pages are same-origin frames, so a book's `<script src>` pointing at any script-returning URL on that host (a JSONP endpoint) would have run with access to the Drive token. The e2e test now stands in such an endpoint and checks the book's script stays blocked. Also added `object-src 'none'`, `base-uri 'none'`, `form-action 'none'` and `frame-ancestors 'none'`.

## 0.22.2 — 2026-10-22

- Security: links in a book open only if they are http(s), in a new tab with no handle on the reader tab (`noopener,noreferrer`). Before, foliate opened any scheme with `window.open`, and the linked page could redirect the reader tab (e.g. to a fake sign-in page). Other schemes (javascript:, data:, file:, mailto:, app protocols) are dropped. E2E covers both cases.

## 0.22.1 — 2026-10-20

- Read aloud on Android: the highlight now follows the speech through each paragraph. Android voices report no individual words, so the highlight moves by the time spoken, at a speed measured from the paragraphs already read.
- Read aloud picks a voice in the reader's own region (e.g. US rather than Australian English) and no longer cancels speech before each paragraph, which on Android could drop it.
- Read-aloud runs are logged (`read_aloud.started`, `read_aloud.stopped`, `read_aloud.failed`) with the stop reason and speech error code, so a stop can be explained from the logs.

## 0.22.0 — 2026-10-20

- Read aloud for EPUB and FB2 (web and desktop): the speaker button in the reader header (or `r`) reads from the page on screen with the device's own voices, in the book's language. The spoken word is highlighted and pages turn on their own, on into the next chapter. While reading, the footer has pause/resume, speed (0.75×–2×) and stop. Turning the page, swiping or jumping from the contents carries on from the new page. PDFs don't offer it.
- Docs: `ARCHITECTURE.md` (v0.22: speech module, engine contract, decisions, tests, build history) and `DESKTOP.md` cover read aloud.

## 0.21.1 — 2026-10-19

- Docs: `ARCHITECTURE.md` brought up to v0.21 (desktop app, files read in place, FB2 and format detection, Drive listing changes, desktop tests); `DESKTOP.md` rewritten from a plan into how the desktop app is built, works and is installed, with phase status.

## 0.21.0 — 2026-10-19

- FB2 books in Google Drive: folders and search list them whatever MIME type Drive gave them (often a generic one), add and sync like other Drive books, and open after download. A Drive book whose name says EPUB but which is really FB2 opens too; its format is corrected on first open. Non-book files in a folder stay hidden.
- The daily Drive check now knows when Drive had more books than it fetched, instead of guessing from the count, so it never marks books missing from an incomplete listing.

## 0.20.0 — 2026-10-19

- FB2 books open from the device (web and desktop): plain `.fb2`, zipped `.fbz` / `.fb2.zip`, in UTF-8 or windows-1251. The format is read from the file's contents, so a zipped FB2 saved as `.epub` opens too. FB2 renders in foliate-js like EPUB (themes, typefaces, contents, positions, local progress sync). The desktop app lists FB2 under Open With. FB2 in Google Drive is not supported yet.
- Fix: a book that failed while its title, contents or cover were read could leave the import silently unfinished; it now says the file can't be opened.

## 0.19.0 — 2026-10-19

- Desktop: built for this Mac only. `bun run desktop:package -- --install` builds the app, signs it ad hoc and copies it to /Applications. The self-signed certificate path, the `.dmg` and the update notice are removed: the app is never distributed.

## 0.18.0 — 2026-10-19

- Desktop (phase 5): `bun run desktop:package` builds a signed Apple Silicon `.dmg` (self-signed "Drive Read Local" certificate, or `--adhoc`). The desktop app checks `desktop-version.json` on the web host at start and offers a newer version for download in the Library. Desktop build output is kept out of the web Docker image.

## 0.17.0 — 2026-10-19

- Desktop (phase 4): reading positions of books opened from local files sync through Drive. A file identical to a Drive book in the library (same MD5) becomes that book, read from disk, and shares its position with every device; if the file goes missing, the book downloads from Drive instead. Other local books sync as `progress-local-<hash>.json`, so the same file on another Mac picks up the place; they never join `library.json`. The web app's local books still stay on the device.

## 0.16.1 — 2026-10-19

- Desktop: Finder opens checked on the packaged app (running and cold start); Drive Read appears under Open With for EPUB and PDF.

## 0.16.0 — 2026-10-19

- Desktop (phase 2): books open from Finder, the Dock, Open Recent, a second launch, drag-and-drop onto the window, and File › Open… (⌘O); the first one opens in the reader, and a file that can't be read says so in the Library. The packaged app declares EPUB as its own type and PDF as "Open With" (`electron-builder.yml`, `bun run desktop:package`), and the Library explains once how to make it the default for EPUB. macOS app icon added to `bun run icons`.

## 0.15.0 — 2026-10-19

- Desktop (phase 1): an Electron shell (`desktop/`, `bun run desktop`) runs the web app from `app://drive-read/`. Books opened from disk are read where they sit instead of being copied into app storage; a moved file shows "Locate file…", which accepts only the same book. The main process reads only files the reader chose. The web app is unchanged.

## 0.14.1 — 2026-10-19

- Desktop: plan for a macOS (Apple Silicon) app in `docs/DESKTOP.md`. Phase 0 spike (`spikes/desktop/`) shows the unchanged web build runs in Electron 44 over `app://`: EPUB, PDF and restart persistence pass with no CSP violations. Electron is a dev dependency; the web app is unchanged.

## 0.14.0 — 2026-10-16

- Fix: a typeface switch applies in one step. The faces are registered once per book page with the FontFace API instead of re-parsing ~1 MB of inline `@font-face` CSS on every settings change, and the new face loads before the CSS names it, so the fallback font no longer flashes.
- Fix: after following a footnote or other in-book link, a "Back to text" button returns to where you were.
- Literata, the default typeface, now includes Cyrillic, so Russian books no longer fall back to Georgia.
- Tooling: `format:check` passes again; the E2E text-settings test no longer matches both "Dark" and "Soft Dark".

## 0.13.2 — 2026-10-14

- Release: includes the 0.13.1 fixes below; `package.json` was never bumped to 0.13.1, so devices kept reporting 0.13.0.
- Fix: a device whose Drive access lapsed showed stale progress as current. The Library now says "Drive access expired. Reconnect to get progress from your other devices." with a Reconnect button even when nothing is waiting to send, and the header reads "Reconnect to sync" instead of the last sync time.

## 0.13.1 — 2026-10-12

- Fix: prevent false dirty progress flags on reader mount due to CFI normalization. Initial restoration relocations during mount are isolated from user-driven page turns, preventing normalized CFIs from dirtying records.
- Fix: cross-device library sync now properly identifies and sets MIME types for PDF books added from Drive (`application/pdf`) rather than defaulting to EPUB.
- Security & Resilience: runtime schema validation for remote Google Drive appData JSON (`library.json` and `progress-<id>.json`) with type guards `isValidLibraryDoc` and `isValidSyncedProgress` to reject corrupt or malformed remote files safely.
- Performance: deduplicate `<BookCover>` mounts and OPFS blob URL allocations in `LibraryView` by conditionally rendering between desktop grid and mobile list based on the responsive breakpoint.
- Memory: clean up canvas GPU backing stores (zeroing width/height on page replace) and invoke `page.cleanup()` and `doc.cleanup()` in the PDF engine to release resources promptly.
- Performance: cache extracted PDF page text tokens in memory for in-book search, avoiding repetitive page decoding on multi-page search queries.
- UI/UX: highlight matching search query keywords in `SearchPanel` result excerpts using styled `<mark>` elements.

## 0.13.0 — 2026-10-08

- In-book search: full-text search for both EPUB (via Foliate view search) and PDF (via pdf.js text layer). Includes live progress indicator, excerpt highlights, chapter/page grouping, and keyboard navigation (`/` or `s` shortcut).
- Low-contrast themes: added Soft Light (`low-contrast-light`) and Soft Dark (`low-contrast-dark`) themes with reduced contrast to ease eyestrain.
- Fix: sync reconnect from header. Clicking sync status ("Synced yesterday ...") or reconnect notice when token is expired prompts re-authentication and pulls latest progress from other devices.
- Fix: PDF initial mount double-rendering eliminated by applying reader theme and text layout before mounting the engine.

## 0.12.0 — 2026-10-07

- Fix: between-device sync now accurately preserves latest progress. Reader mount no longer falsely marks progress dirty with a new timestamp, avoiding overwriting progress from other devices.
- Sync on tab visibility: returning to a visible tab now pulls recent reading progress made on other devices.
- Added custom typefaces: Cartisse, Libron, NV Jost, NV Zilla Slab, Readerly.

## 0.11.0 — 2026-10-05

- PDF zoom: 100–300% of the fitted width with − / % / + in the footer, the keys `+` `-` `0`, or a
  two-finger pinch (the page follows the fingers, then renders sharp). Zoomed in, a swipe pans
  instead of turning the page. Canvas resolution is capped at 16 M pixels (iOS limit).
- PDF text layer: page text is selectable and copyable (and found by the browser's find).
- pdf.js data files served from `/pdfjs/` (`scripts/pdfjs-assets.ts`): standard fonts, ICC
  profiles and the WebAssembly decoders for JPEG 2000, JBIG2 and colour are precached; CMaps (CJK)
  are cached on first use. CSP `script-src` adds `'wasm-unsafe-eval'` (WebAssembly only, no JS eval).
- foliate-js's own PDF path is stubbed at build time: ~400 KB of a second pdf.js is no longer
  shipped or precached.
- Fix: every PDF open rendered its first page twice.
- Tests: zoom levels (fast-check), keys, reader store zoom; e2e for zoom, pinch (two-finger CDP
  touches), the text layer, and the data files under the CSP.

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
