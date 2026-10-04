# Changelog

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
