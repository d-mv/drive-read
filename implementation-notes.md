# Implementation notes

Conservative choices and deviations from the architecture doc, newest first.

## 2026-10-20: Read aloud (v0.22.0)

- **Asked for by the owner** for non-PDF books. EPUB and FB2 only: PDF text has no block structure to read by.
- **Browser voices only** (`speechSynthesis`): no new dependency, no cost, works offline and in Electron. Voice is picked by the block's `xml:lang` (`pickVoice`), else the browser's default. No voice picker yet.
- **SSML is flattened to text**: browsers don't speak SSML. `<break>` becomes a space; emphasis and phonemes are dropped.
- **Pause is cancel + resume from the last word**: `speechSynthesis.pause()` is unreliable (Android ignores it). The same path applies a new speed.
- **Speed is kept for the session only**, not saved in settings.
- **Swipes** are seen through the paginator's `relocate` reason `snap` (`ReadAloudSource.onSwipe`), since they don't go through the store.
- **Voices without word boundaries** (Android Chrome's, checked on an Android 16 emulator with Chrome 134): the highlight follows elapsed time at a speed in characters per second, starting at 14 and re-measured from every finished block longer than a second (v0.22.1). The first real boundary turns the estimate off for the run. It drifts within a block, but turns pages at about the right time.
- **No `cancel()` before each `speak()`** (v0.22.1): on Android a cancel right before speak can drop the new utterance. Pause, stop and jumps still cancel. An utterance that ends without having started is reported as error `no-start` instead of moving on.
- **Voice choice** prefers the reader's region from `navigator.languages`, then the default, then an on-device voice: Android lists `en_AU` first and flags no default. Android also returns no voices until shortly after load, so the first block may use the browser's choice.
- **Logged** as `read_aloud.*` with the stop reason and error code. A report from a phone of reading "stopped immediately" did not reproduce on the emulator with the test EPUB and FB2; the events are there to explain the next one.
- **Limits:** phones may stop speaking when the screen locks; there is no Media Session / lock-screen control.
- **E2E** (`e2e/read-aloud.spec.ts`) replaces `speechSynthesis` with a fake that sends word boundaries; real macOS Chromium was probed by hand (180 voices, per-word boundaries).

## 2026-10-19: FB2 in Google Drive (v0.21.0)

- **Drive's MIME type for FB2 can't be trusted** (it keeps what the uploader sent: often `application/octet-stream` or `application/zip`), and `q` can't filter by extension. So:
  - **Folders** list every child (`'<id>' in parents and trashed = false`) and the app keeps folders and books by `driveFormat` (MIME or name).
  - **Search and the daily check** query EPUB/PDF/FB2 MIME types plus `name contains 'fb2'` / `'fbz'` (Drive matches word prefixes), then drop non-books by name. Generic zip/binary types are not queried, to keep whole-Drive listings small.
- **`listAllBooks` replaces `searchBooks('')` for the daily check** and returns `complete` from Drive's `nextPageToken`. Counting results after dropping non-books could have made a cut-short listing look complete.
- **The reader re-detects the format from the downloaded bytes** and records it (`library.setFormat`), so a Drive file misnamed `.epub` opens as FB2 and stays so.
- **Fake Drive (E2E)** now honours the book query (MIME list, name-prefix terms, the user's name filter), serves each file's own bytes, and has an `Русское` folder with an octet-stream FB2, a zipped FB2 named `.epub` and a `cover.jpg`.

## 2026-10-19: FB2 (v0.20.0)

- **Asked for by the owner** after a zipped FB2 saved as `.epub` failed to open. foliate-js already reads FB2; the app now accepts it from the device.
- **Format by content, then name** (`services/engine/sniff.ts`): `%PDF`, the first zip entry (`mimetype` → EPUB, `*.fb2` → FB2), or a `<FictionBook` tag; otherwise by extension/type, so a damaged book still reaches its engine and reads as damaged, not unsupported.
- **foliate-js picks its reader by file name**, so `foliateFile` hands it `book.fb2` or `book.fbz`.
- **Not in Drive yet** (added in v0.21.0, above).
- **Desktop Open With only** for `.fb2`/`.fbz` (imported UTIs `ru.gribuser.fictionbook.fb2|fbz`); `.fb2.zip` can't be claimed without claiming `.zip`.
- **Bug found on the way:** foliate's FB2 `getCover()` returns `null`, not a promise, and `.catch` on it threw outside the engine's try, so the import never finished and showed nothing. The whole `open` is now inside the try. Fixtures: `bun e2e/fixtures/build-fb2.ts`.

## 2026-10-19: Desktop app, local build only (v0.19.0)

- **Owner decision: no certificate, never distributed.** Removed the "Drive Read Local" certificate path, the `.dmg`, `--release`/`desktop-version.json` and the update notice (`desktop/updates.ts`, `app/desktopUpdate.ts`, IPC `app:update`). The v0.18.0 notes below describe what was removed.
- **`bun run desktop:package -- --install`** copies the ad-hoc-signed `.app` to /Applications and refuses while that copy is running.
- **Keychain prompt after each rebuild (phase 3):** an ad-hoc signature changes with every build, so macOS asks again before the new build can read the stored Google token. Accepted for a personal build.

## 2026-10-19: Desktop app, phase 5 (v0.18.0)

- **The `.dmg` is made with `hdiutil`, not electron-builder's dmg target.** electron-builder only signs with Apple identities; the self-signed certificate is applied with `codesign` after packing, which has to happen before the image is made.
- **`codesign --deep`** signs the helper apps and frameworks in one pass. Without notarisation there is no hardened runtime, so Electron needs no entitlements.
- **The version check runs in main** (`net.fetch`), so the page's CSP gains no new origin. Only an `https` download link is accepted; it opens in the browser through the window-open handler.
- **Desktop tests point `DR_VERSION_URL` at an unreachable port**, so they never ask the live server.
- **`.dockerignore` now excludes `desktop/out` and `desktop/release`**: the web image's `COPY . .` would otherwise carry a 300 MB app.
- **Open:** the release host for the `.dmg` (the version file defaults to a public GitHub release) and the owner's certificate.

## 2026-10-19: Desktop app, phase 4 (v0.17.0)

- **Matched against library books only**, not `library.json` entries directly: sync adds every entry to the library, so a Drive book from another device is matched once this Mac has synced.
- **Matching happens at import.** A local book already in the library is not re-matched when the same file is later added from Drive; the two stay separate entries. Rare, and fixable by removing the local one.
- **Local progress sync is desktop-only**, keyed by `useServices().files` being present. The web app's local books have the same ids, so turning it on there later is a one-line change.
- **Not covered end to end yet:** Drive sign-in doesn't work in the desktop app until phase 3, so the desktop E2E can't reach Drive. Unit tests cover matching, the progress push and pull between two Macs, and the download fallback.

## 2026-10-19: Desktop app, phase 2 (v0.16.0)

- **Packaging config moved forward from phase 5.** File associations live only in a packaged app's `Info.plist`, so `electron-builder.yml` and the macOS icon came with phase 2. Signing, DMG polish and the update notice stay in phase 5.
- **`CFBundleDocumentTypes` via `extendInfo`**, not `fileAssociations`: system UTIs (`org.idpf.epub-container`, `com.adobe.pdf`) match files by type, not only by extension, and `LSHandlerRank` is set explicitly.
- **Becoming the EPUB default is a hint, not an action.** macOS has no Electron API for a file-type default and asks the user anyway; the Library shows the Get Info › Change All steps once. An EPUB arriving from Finder ends the hint.
- **Recents only from the packaged app**, so dev and test runs never write to Electron.app's recent documents.
- **Checked on the packaged app (owner's OK, 2026-10-19):** `open -a "Drive Read" book.epub` opens the book in a running app, and a cold launch the same way adds it in place and opens it (the `open-file` event fires before `ready`). macOS lists Drive Read under Open With for EPUB and PDF; the existing defaults (Clearview, CaxtonPDF) are untouched. The packaged app serves `dist/` from `app.asar`.

## 2026-10-19: Desktop app, phase 1 (v0.15.0)

Deviations from `docs/DESKTOP.md` as planned:

- **No `'file'` source.** A book read in place is `source: 'local'` with a `path`. Sync, events and views already branch on `'local' | 'drive'`; a third source would touch all of them for no gain, and phase 4 can put `path` on a Drive record.
- **No desktop Vite build mode.** One build; the renderer checks `window.driveReadDesktop` at run time.
- **The picker is still the hidden `<input type=file>`**, not an Electron dialog. The preload derives the path from the chosen File, so the page never names a path to grant, and the existing E2E file-chooser flow works unchanged.
- **Moved files are detected on open**, not in the library list: the reader shows `file-moved` with "Locate file…". A library-row badge would need a stat per book at start.
- **The spike is deleted**; `desktop/main.ts` replaced it.
- `files.ts` compares the requested path with its normalised form, so `/kept/a.epub/../../x.epub` is denied even though grants are stored normalised.

## 2026-10-19: Desktop app, phase 0 spike (v0.14.1)

- **Plan:** `docs/DESKTOP.md`. Electron, macOS `arm64` only, no Apple Developer ID (self-signed certificate, version-file update notice instead of electron-updater), local files read in place, local-file progress synced, owner of `.epub` and alternate for `.pdf`.
- **Spike result:** the web build runs unchanged from `app://drive-read/` (privileged standard, secure scheme, CSP from `csp.ts` sent as a header). IndexedDB and OPFS persist across restarts in the app profile. The service worker does not register on `app://`; that is wanted, since the desktop app updates differently.
- **Main process is bundled with `bun build`** (ESM; external `electron`), no extra bundler dependency. The sandboxed preload (phase 1) must be CommonJS.
- **Spike test quirk:** from the Library, importing a file only adds it (the web app's behaviour); the reader opens straight away only from the first-run screen.

## 2026-10-12: Sync hardening, PDF engine memory lifecycle, and UI performance (v0.13.1)

- **Mount-time relocation isolation:** Foliate's engine normalizes CFIs upon rendering (e.g. adding or altering step identifiers). If emitted during mount, an initial relocation with a normalized CFI could differ from the stored raw locator string and falsely mark the record `dirty`. We introduced an `isMounting` guard across `engine.mount(el, restore)`: any relocation received while `isMounting` is active updates the reader state without triggering `library.saveProgress()`.
- **Runtime validation of remote appData:** Drive sync accepts arbitrary JSON from `library.json` and `progress-<fileId>.json`. To prevent crashes from corrupt files or schema drifts, `isValidLibraryDoc` and `isValidSyncedProgress` validate payloads at runtime, logging a warning and safely ignoring invalid records.
- **MIME type detection on cross-device sync:** `libraryChanges` previously defaulted added Drive entries to `application/epub+zip`. It now checks for `.pdf` extensions and assigns `application/pdf`, ensuring synced PDFs download with proper headers and open in `pdfjs`.
- **PDF GPU and DOM cleanup:** Canvas elements retain GPU backing stores even after removal from DOM if not explicitly resized to `0x0`. The PDF engine now sets `width = 0; height = 0` on superseded canvases, calls `page.cleanup()` on replaced pages, and invokes `doc.cleanup()` when destroying the engine. Search also maintains an in-memory page text cache to avoid re-extracting text across subsequent search operations.
- **Responsive LibraryView rendering:** Instead of mounting both desktop grid and mobile list simultaneously and toggling visibility via CSS media queries, `LibraryView` checks `matchMedia('(min-width: 640px)')` to conditionally mount either `BookCard` or `BookRow`, halving OPFS blob cover fetches and memory footprint.

## 2026-10-07: Custom typefaces & sync reliability (v0.12.0)

- **Mount relocations do not save or dirty progress.** In both foliate and PDF engines, mounting fires an initial `relocate` at the restored location. `reader.ts` now distinguishes this initial restore and layout changes (window resize, device orientation) from real page turns. This prevents newly opened devices from generating false dirty records with newer timestamps that would otherwise win conflict resolution and overwrite newer progress from other devices.
- **Pull on tab visibility.** When returning to a visible tab (`visibilitychange` with `visibilityState === 'visible'`) while connected, the app pulls sync so that progress made on another device while the tab was hidden is reflected immediately.
- **Additional typefaces.** Added Cartisse, Libron, NV Jost, NV Zilla Slab, and Readerly to reader settings and theme injection.

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

## 2026-10-05: Drive browser changes (v0.2.1, v0.3.0)

- **Fixed a race (v0.2.1).** A slow whole-Drive listing could overwrite the folder being browsed. Listings now carry a sequence number, and only the latest one updates the screen.
- **No "All books" view (user request).** The screen opens on My Drive. Search stays: while the box has text it shows matching books, and the folder trail is kept, so clearing the search returns to the same folder. The canvas artboard "DriveBooks" is now out of date.
- **Sorting is done in the app, not by Drive.** Drive's `orderBy=name` sorts by the raw name, which doesn't match the labels shown ("Mark Dawson" for `dawson,-mark`). The app sorts with `Intl.Collator` (base sensitivity, numeric).

## 2026-10-05: Build step 5, sync (v0.4.0)

- **Books opened from local files don't sync** (the open decision is left on its conservative default). Only Drive books sync.
- **Idle pushes merge library.json first.** Every push lists the app folder (one call) and merges library.json if it changed, so a push never overwrites another device's library changes. Progress records are pushed without reading the remote copy first; a conflict between two positions is resolved at the next pull, following the doc's latest-write-wins rule.
- **A removal from another device skips the book open in the reader;** it is applied on the next sync.
- **Continue reading** now follows the latest position from any device, not just the last book opened on this one (the canvas shows "Last read on phone").
- **Bug found through the remote log:** `{ ...reactiveBook }` keeps nested proxies, and IndexedDB can't clone them, so record updates failed silently. Records are now unwrapped with `toRaw` before writing, and the sync meta and library.json are copied as JSON. A regression test reloads from storage.
- **Vitest loads `.env`,** so unit tests were sending to the production log. `test.env` now blanks the ingest key.
- **Sync status in the header** ("Synced 14:02", click to sync now) is shown only once Drive has been connected.

## 2026-10-05: Build step 6, PDF (v0.5.0)

- **pdfjs-dist 6.4.299 from npm**, not foliate-js's experimental PDF adapter (the doc's choice). foliate's own vendored pdf.js chunk (~400 KB) is never loaded but is still precached; excluding it would need a custom chunk-naming rule.
- **One page at a time, fitted to width.** A tall page scrolls before the page turns; there is no continuous scroll and no pinch-zoom yet, so text on a phone is small (Kairos task).
- **No text layer:** PDF text can't be selected or searched yet.
- **Standard fonts:** non-embedded standard fonts (e.g. Helvetica) map to system fonts; `standardFontDataUrl` isn't set. JPEG 2000 images need pdf.js's wasm decoder, which isn't served, so such images won't render.
- **Text settings for a PDF show only Margins (page width) and Theme.**
- **Precache is now ~2.9 MB**, mostly the pdf.js worker (1.2 MB), so both formats open offline as the doc requires.
- **Test fixture:** `e2e/fixtures/build-pdf.ts` hand-writes a 6-page PDF with an outline and metadata, without adding a PDF library.

## 2026-10-05: Build step 8, PWA and updates (v0.6.0), added by the owner

- **Run before hardening (step 7)** at the owner's choice, so hardening can test the update flow on Android too.
- **Icons are rendered with the Playwright Chromium already installed** (`scripts/icons.ts`) rather than adding an image tool. Maskable and Apple touch icons shrink the artwork into the 80% safe zone.
- **Update checks** call `registration.update()` on visibility, on coming back online and hourly. Only a user tap applies an update. The open book survives the reload because its route is in the URL and its position is saved on every page turn.
- **The update notice is now an app-wide toast** (`UpdateToast.vue`) instead of a library-only bar. In the reader it sits above the footer.
- **The update e2e test runs its own static server on a free port.** `vite preview` caches its file list, so it wouldn't see the swapped build.
- **Not done here:** server headers. `sw.js` and `index.html` need `Cache-Control: no-cache` on Caddy; that's checked in the deploy task.

## 2026-10-05: Observability (v0.7.0)

- **Identity is options A and B (owner decision):** a random device id, plus a hashed Drive permission id. No email. The `drive.readonly` scope is enough for `about.user.permissionId`.
- **`reading.session` doesn't count the first position report**, since that's the restored starting point. It is sent when the book closes and when the tab is hidden, because a closed tab never calls `close()`.
- **CSP violations report only the blocked origin or kind** (`blob`, `inline`, …). A blob URL or path could name a book.
- **Log levels come from event names.** A test caught that `sync.failed` was logged as info; the rule is now `[._]failed$`.
- **Logger retention is 7 days.** Long-term trends need longer retention or periodic aggregates (Kairos task).

## 2026-10-05: Hardening, first pass (v0.8.0)

- **One idle threshold (5 min, `domain/reading.ts`) for both the wake lock and reading time.** Keeping the screen on with nobody reading would drain the battery, and counting that time would inflate `reading.session`.
- **An interrupted download shows the "offline" message with Try again.** The doc suggested a Retry on the library row; the reader screen is where the user is when it happens.
- **Deferred to their own tasks:** noticing a file replaced in Drive (md5), "Missing in Drive" on library rows, and "Remove download" to free space.
- **The phone checks stay with the owner:** sign-in in the installed app, and install and update on a phone.
