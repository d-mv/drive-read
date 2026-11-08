# Drive Read Desktop

A macOS app (Apple Silicon only) built from the same Vue code as the web app, for the owner's
Mac only. It reads local EPUB, FB2 and PDF files where they sit, is the default app for `.epub`
once chosen in Finder, appears in "Open With" for `.pdf`, `.fb2` and `.fbz`, and syncs reading
positions for local files through Drive. Related: [`ARCHITECTURE.md`](ARCHITECTURE.md).

**Status (v0.25.0, 2026-11-08):** all phases are built. Phase 3 (Google sign-in) is tested
against a fake Google; it works for real once `.env` has the owner's "Desktop app" OAuth client
(`DESKTOP_GOOGLE_CLIENT_ID`, `DESKTOP_GOOGLE_CLIENT_SECRET`). Without it, Connect Google Drive
reports that sign-in is unavailable, and local books work fully.

## Build and install

Needs Bun, the repo's dependencies (`bun install`) and a `.env` with `VITE_GOOGLE_CLIENT_ID`
(and `VITE_LOGGER_INGEST_KEY` for logs), as for the web app, plus `DESKTOP_GOOGLE_CLIENT_ID` and
`DESKTOP_GOOGLE_CLIENT_SECRET` for Drive sign-in (Google Cloud Console → Credentials → Create
OAuth client ID → Desktop app, in the web client's project).

```sh
bun run desktop:package -- --install   # build, sign ad hoc, copy to /Applications
bun run desktop:package                # build only: desktop/release/mac-arm64/Drive Read.app
bun run desktop                        # run from the repo without packaging
bun run test:desktop                   # desktop end-to-end tests
```

- **Update:** quit the app and run the install command again. `--install` refuses while the
  installed copy is running.
- **EPUB default:** macOS keeps the current EPUB app until you change it once: select an EPUB in
  Finder → File › Get Info → Open with: Drive Read → Change All. The Library shows these steps
  once.
- **Keychain:** an ad-hoc signature changes with every build, so macOS asks once after each
  rebuild whether Drive Read may use its keychain entry (the key that encrypts the Drive
  sign-in).
- **Web deploys:** `.dockerignore` keeps `desktop/out` and `desktop/release` out of the web
  image, but the deploy skill's rsync uploads the repo, so move `desktop/release` (about 300 MB)
  aside while deploying.

## Decisions

| Question | Decision |
| --- | --- |
| Shell | Electron (Chromium, so foliate-js, pdf.js, OPFS, IndexedDB and `navigator.locks` behave as on the web) |
| Platforms | macOS, `arm64` only |
| Distribution | None: built and installed on the owner's Mac only |
| Signing | Ad hoc (`codesign -s -`); no certificate, no notarisation |
| Updates | Rebuild and reinstall; no update check |
| Local files | Read in place by path; no copy into OPFS |
| Local progress | Synced: as that Drive book when the file's MD5 matches one, otherwise as `progress-local-<sha256>.json` |
| File types | Owner of `.epub` (`org.idpf.epub-container`); alternate for `.pdf` (`com.adobe.pdf`), `.fb2` and `.fbz` (declared UTIs `ru.gribuser.fictionbook.fb2` / `.fbz`) |
| Build | One web build for both; the page detects the desktop bridge at run time |
| CI | None. Everything is built and packaged locally |

## How it works

```text
desktop/
  main.ts        app lifecycle, window, app:// protocol, file opens, menu, IPC handlers
  preload.ts     contextBridge: `window.driveReadDesktop`, nothing else (CommonJS: sandboxed)
  files.ts       kept-file allowlist (kept-files.json), reading, MD5
  opens.ts       queue for files that arrive before the page listens; launch arguments
  menu.ts        File › Open… (⌘O) and Open Recent
  auth.ts        Google sign-in: loopback + PKCE, refresh token encrypted with safeStorage
  build.ts       bun build: main (ESM) and preload (CJS) into desktop/out/
  e2e/           Playwright `_electron` tests
src/shared/desktop.ts               the bridge contract and IPC channel names
src/services/auth/desktop.ts        `Services.gis` in the desktop app: sign-in through the bridge
src/services/storage/localFiles.ts  `Services.files`: keep, read, md5 (null on the web)
src/app/desktopOpen.ts              books from Finder, drop and the menu; the EPUB hint
scripts/package-desktop.ts          `bun run desktop:package`
electron-builder.yml                .app layout, icon, document types
```

- **Origin:** the web build is served from `app://drive-read/` (a privileged standard, secure
  scheme), with the CSP from `csp.ts` as a header, so storage, `fetch` and the CSP behave as on
  the web. No service worker registers there.
- **Isolation:** `contextIsolation` and `sandbox` on, no Node in the page. Navigation away from
  the origin is blocked; web links open in the browser. The only permission granted is the
  screen wake lock. IPC is answered only for `app://drive-read/` and every argument is checked.
- **Sign-in:** Google's OAuth flow for installed apps, run by main (`desktop/auth.ts`). Connect
  opens Google's consent page in the system browser; Google redirects to a one-shot server on
  `127.0.0.1` (random port, closed after one reply or 5 minutes), and only a reply carrying the
  request's `state` counts. The code is exchanged with PKCE (S256). The refresh token stays in
  main, encrypted with `safeStorage` (the keychain) in `drive-sign-in.bin` in the app profile;
  without a keychain it is not saved. The page asks main for access tokens over IPC
  (`auth:connect`, `auth:token`, `auth:disconnect`) and renews them without a tap, also after a
  401. Disconnect revokes the refresh token at Google and deletes the file. A test run's
  `DR_FAKE_GOOGLE` (dev only) points at a local fake, without the browser or the keychain.
- **Launch hardening:** the packaged app's Electron fuses (`electron-builder.yml`) turn off
  `ELECTRON_RUN_AS_NODE`, `NODE_OPTIONS` and `--inspect`, and load only the integrity-checked
  `app.asar`, so another process cannot run its own code as Drive Read (and use its macOS folder
  permissions). `DR_DIST` and `DR_USER_DATA` (`desktop/overrides.ts`) and DevTools work in dev
  and test runs only.
- **File access:** the page never names a path to grant. It hands over a `File` the user chose;
  the preload gets its path from Electron (`webUtils.getPathForFile`), and main keeps it in
  `kept-files.json` in the app profile. Main reads only kept paths, exactly as kept (a path that
  only normalises to a kept one is refused), and only book names (`.epub`, `.pdf`, `.fb2`,
  `.fbz`, `.fb2.zip`). Files from Finder, the Dock, Open Recent and launch arguments are the
  user's choice too, and main keeps them itself. A symlink is never kept, and a kept path is
  opened without following symlinks, so swapping it for one later reads nothing.
- **Books read in place:** such a book keeps `source: 'local'` and gains `path`. Opening reads
  the bytes from main as a `File`, so the engines and the reader do not change. A file no longer
  at its path fails with `file-moved`: "Locate file…" re-links it, accepting only the same bytes
  (same `local-<sha256>` key).
- **Opening from outside:** main queues paths from `open-file` (Finder, Dock, Open Recent; it can
  fire before `ready`), launch arguments and `second-instance` until the page registers
  `onOpenPaths`. The page reads them, adds them and opens the first; drop and File › Open… go the
  same way. Open Recent entries are written only by the packaged app.
- **Local progress sync:** on import, main hashes a kept file with MD5. If a Drive book in the
  library has that MD5, the file becomes that book: the Drive record gains `path` and shares its
  synced position with every device. Other local books sync their position as
  `progress-local-<sha256[0..32]>.json`, so the same file on another Mac picks up the place; they
  never join `library.json`. A Drive book whose file is gone falls back to its OPFS copy, then to
  downloading.
- **Formats:** every import and open checks the bytes (`engine/sniff.ts`), so a zipped FB2 saved
  as `.epub` opens as FB2.
- **Read aloud:** the same as the web app; Electron's Chromium speaks with the macOS system voices
  (Russian included), with per-word highlighting.

## Phases

| # | Phase | State |
| --- | --- | --- |
| 0 | Spike: the web build in Electron over `app://` | Done (v0.14.1); spike removed |
| 1 | Desktop shell, local files read in place, "Locate file…" | Done (v0.15.0) |
| 2 | File types, single instance, Finder / Dock / drop / File › Open…, Recents, EPUB hint | Done (v0.16.0); Finder opens checked on the packaged app |
| 3 | Desktop OAuth (system browser, loopback redirect, PKCE) with the refresh token in the keychain (`safeStorage`) | Built (v0.25.0); tested against a fake Google, real sign-in waits for the owner's "Desktop app" OAuth client in `.env` |
| 4 | Local-file progress sync (MD5 match, `progress-local-*`) | Done (v0.17.0); end-to-end against Drive waits for phase 3 |
| 5 | Local packaging and install | Done (v0.19.0). The `.dmg`, certificate and update check of v0.18.0 were removed: the app is never distributed |

## Dependencies

| Package | Status (2026-10-19) | License |
| --- | --- | --- |
| electron 44.9.0 | Active, released 2026-10-17 | MIT |
| electron-builder 26.15.3 | Active, last push 2026-10-18 | MIT |

The main process and the preload are bundled with `bun build` (`desktop/build.ts`); no extra
bundler.
