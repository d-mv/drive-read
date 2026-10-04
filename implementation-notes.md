# Implementation notes

Conservative choices and deviations from the architecture doc, newest first.

## 2026-10-04 — Drive access spike

- The Kairos project is under the **Apps** area: no "Projects" area exists, and every other app lives in Apps.
- The spike (`spikes/drive-access/`) is a Bun server plus one TS file, with no Vite or Vue, so it stays isolated from the app build.
- The spike uses the doc's CSP **verbatim**. Any violations it reports feed the CSP task; the spike does not patch around them.
- The app name is set to **Drive Read**. The architecture doc and the UI canvas still show it as open; there is a Kairos task to update them.
- Logging: when the Logger ingest key ships in a client-only bundle, it is public. That risk is noted on the Logger Kairos task. Registering the key in logger-api needs a logger-api redeploy, so it waits for confirmation.

## 2026-10-04: Build steps 1–3 (shell, local reader, library), v0.1.0

- **TypeScript 6.0.3, not 7.** Your Telegram Feed v3 project stays on TS 6 with vue-tsc, and TS 6 typechecks cleanly here.
- **idb 8.0.3 is stale.** Its last release was May 2025. It is kept because the doc names it and the library is small and complete. If it ever blocks work, a hand-written wrapper of about 60 lines replaces it.
- **Fonts are OFL-1.1** (fontsource). OFL allows bundling with any app; only a modified font must stay OFL.
- **Local book key is `local-<sha256[0..32]>`, not `local-<md5>`.** Web Crypto has no MD5. This matters only if local files ever re-match Drive files by md5; that's part of the "progress sync for local files" decision.
- **`BookEngine` additions:** a `{ kind: 'href' }` locator for TOC targets (never stored as a position), `Relocation` (the position plus minutes left in the chapter), and `onKeydown`, because keys pressed inside the book frame don't reach the app.
- **The engine parses the book on import** to read its title, author, cover and TOC. The library shows real metadata from the start, and DRM or damaged files are rejected before anything is stored.
- **Bookmark button and Bookmarks tab are left out.** They appear on the canvas, but bookmarks are not in v1, and there's no dead control in their place.
- **PDF is refused at import with a message** until build step 6. pdf.js chunks are kept out of the precache.
- **"Connect Google Drive" says Drive isn't connected in this version.** The button stays, so the first-run layout matches the canvas.
- **Device id and name live in localStorage, not IndexedDB settings.** They are needed synchronously at startup.
- **Theme persistence:** the localStorage theme mirror wins over IndexedDB on load. An e2e test found that a reload right after a change could revert the theme, because the IndexedDB write hadn't landed yet.
- **One reading column.** foliate defaults to two-page spreads; the canvas shows one centred 620px column.
- **Phone:** no tap zones; foliate's swipe handles paging. The grid/list toggle is desktop-only, and the phone always lists.
