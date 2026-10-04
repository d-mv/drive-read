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

## 2026-10-04: No Google Picker (user decision)

- **Scope.** Without the Picker, `drive.file` can't see existing books, so the app uses `drive.readonly` and `drive.appdata`. `drive.readonly` is a restricted scope: it works for the owner and up to 100 test users behind Google's unverified-app screen, and a public release needs Google's security assessment.
- **No API key.** Every Drive call carries the user's OAuth token, so a key adds nothing, and one shipped in the bundle could be used to spend the project's quota. The app ID (project number) was only needed by the Picker.
- **CSP.** `apis.google.com` and `docs.google.com` are removed.
- **New UI.** The app needs its own Drive browser screen ("Add from Drive"), which the design canvas doesn't have.
- **Verify task moot.** "Does picking a folder under drive.file grant access to its files?" no longer applies: with `drive.readonly`, importing a folder means listing its children.

## 2026-10-04: Build step 4, Drive import (v0.2.0)

- **library.json in appData isn't written yet.** The doc puts it under "Register"; it moves to build step 5 (sync), together with the merge rules.
- **No "Folder" column in All books.** Showing each book's folder needs one extra call per parent folder; it was left out to keep search to a single call. The canvas shows the column.
- **PDFs are listed but not addable** ("PDF later") until build step 6.
- **Adding on the phone uses checkboxes and the bottom bar only**, as on the canvas. Per-row "Add" buttons are desktop-only.
- **Folder labels:** only `last,-first` slugs are renamed ("dawson,-mark" → "Mark Dawson"). A single lowercase word like `books` stays as-is. The first version renamed it "Books", which an e2e test caught.
- **md5 isn't used yet for re-matching** a file uploaded again; it is stored on the record.
- **Recursive folder add** stops after 500 folders, walking 4 at a time, and says so when it stops early.
- **Token:** kept in memory and sessionStorage, as the doc says, and treated as expired 60 s before Google's expiry.
