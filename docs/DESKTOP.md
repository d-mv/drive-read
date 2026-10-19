# Drive Read Desktop: Plan

Planned October 2026. A macOS (Apple Silicon only) desktop app built from the same Vue code as
the PWA. It reads local EPUB and PDF files where they sit, is the default app for `.epub`, appears
in "Open With" for `.pdf`, and syncs reading positions for local files too. The web build is
unchanged. Related: [`ARCHITECTURE.md`](ARCHITECTURE.md).

## Decisions

| Question | Decision |
| --- | --- |
| Shell | Electron (Chromium, so foliate-js, pdf.js, OPFS, IndexedDB and `navigator.locks` behave as on the web) |
| Platforms | macOS, `arm64` only |
| Signing | No Apple Developer ID. A free self-signed certificate gives every build the same identity, so the keychain does not re-prompt after an update |
| Updates | No electron-updater (Squirrel.Mac needs a notarised app). The app reads `desktop-version.json` from drive-read.mlnkv.net and shows a download link |
| Local files | Read in place by path; no copy into OPFS |
| Local progress | Synced: by Drive identity when the file's MD5 matches a Drive book, otherwise as `progress-local-<sha256>.json` |
| File types | Owner of `.epub` (`org.idpf.epub-container`), alternate for `.pdf` (`com.adobe.pdf`) |
| CI | None. Everything is built and packaged locally |

## Shape

```text
desktop/
  main.ts        app lifecycle, window, app:// protocol, file opens, IPC handlers
  preload.ts     contextBridge: the typed `window.driveReadDesktop` API, nothing else
  files.ts       path allowlist, reading, hashing (MD5 + SHA-256)
  oauth.ts       desktop OAuth: system browser, loopback redirect, PKCE, refresh token
  build.ts       bun build for main (ESM) and preload (CJS, required by the sandbox)
src/
  shared/desktop.ts   the bridge contract, shared by preload and renderer
  services/...        desktop implementations behind the existing Services interface
```

- The renderer is the existing app, served from `app://drive-read/` (a privileged standard,
  secure scheme) so storage, `fetch` and the CSP behave like a real origin. The CSP comes from
  `csp.ts`.
- `contextIsolation`, `sandbox` on; no Node in the renderer. Every IPC argument is validated.
- Main reads only paths the user granted: picker, drag-and-drop, Finder opens, and paths already
  in the library.
- The desktop build turns off the service worker and the PWA update toast.

## Book records

A book read in place keeps `source: 'local'` and gains `path` (absolute). Opening reads the bytes
from main as a `File`, so engines and the reader do not change. A file no longer at its path
fails with `file-moved`: "Locate file…" re-links it, accepting only the same bytes (content hash).
The key stays `local-<sha256[0..32]>`, or the Drive file ID when the MD5 matches a Drive book
(phase 4, which reuses `path` on a Drive record).

## As built (phase 1, v0.15.0)

- **One web build.** The app detects `window.driveReadDesktop` at run time: no desktop Vite mode.
  On desktop it skips the service worker; Electron never fires the install prompt.
- **`Services.files`** (`services/storage/localFiles.ts`): `keep(file)` and `read(path, type)`;
  null on the web. The existing hidden file input still picks files; the preload gets each
  File's path from Electron (`webUtils.getPathForFile`).
- **Main** (`desktop/files.ts`) keeps the chosen paths in `kept-files.json` in the app profile
  and reads only those, compared as given (no `..` tricks), EPUB and PDF only, and answers IPC
  only from `app://drive-read/`. Navigation away from the origin is blocked; web links open in
  the browser; the only permission granted is the screen wake lock.
- **Opening from outside (phase 2, v0.16.0):** main queues paths from `open-file` (Finder, Dock,
  Open Recent; may fire before `ready`), launch arguments and `second-instance`, keeps them and
  sends them once the page registers `onOpenPaths`. The page reads them in place
  (`app/desktopOpen.ts`), adds them and opens the first. Drop and File › Open… go the same way.
  Open Recent entries are written only by the packaged app.
- **Packaging:** `electron-builder.yml`; `bun run desktop:package` → `desktop/release/`. The
  document types are written as `CFBundleDocumentTypes` with system UTIs (EPUB `Owner`, PDF
  `Alternate`) rather than electron-builder's extension-based `fileAssociations`.
- **Local progress sync (phase 4, v0.17.0):** on import, main hashes a kept file with MD5
  (`files:md5`); a Drive book in the library with that `md5` gains the file's `path` and the
  import returns it. Sync already adds every `library.json` entry to the library, so that list
  covers books from other devices. In the desktop app `sync` treats local books as synced for
  progress only (`progress-local-<sha256[0..32]>.json`); `library.json` stays Drive-only. A Drive
  book whose file is gone falls back to OPFS, then to downloading.
- **Run:** `bun run desktop`. **Test:** `bun run test:desktop` (Playwright `_electron`,
  `desktop/e2e/`); unit tests in `desktop/*.test.ts` run with the rest.

## Phases

| # | Phase | Done when |
| --- | --- | --- |
| 0 | Spike (`spikes/desktop/`): Electron loads the current build over `app://` | EPUB and PDF open; OPFS and IndexedDB persist across restarts; CSP is clean |
| 1 | Desktop shell, desktop services, local files read in place, missing-file handling | Open, close and reopen a local book with no copy; unit tests cover the `'file'` source |
| 2 | File association, single instance, drag-and-drop (window and Dock), recents, default-app hint | Double-clicking an `.epub` opens it cold and while running; `.pdf` is listed in "Open With" |
| 3 | Desktop OAuth with the refresh token in the keychain (`safeStorage`) | Drive browse and sync survive a restart with no reconnect |
| 4 | Local-file progress sync (MD5 match, `progress-local-*`) | The same file on two Macs keeps its position; a Drive-matched local file syncs with the phone |
| 5 | Packaging: self-signed `arm64` `.dmg`, version check, docs | A fresh install registers the file types; the update notice shows when the version file is bumped |

Needs from the owner: a "Desktop app" OAuth client in Google Cloud Console (phase 3), and a
self-signed code-signing certificate in Keychain Access (phase 5).

## Dependencies

| Package | Status (2026-10-19) | License |
| --- | --- | --- |
| electron 44.9.0 | Active, released 2026-10-17 | MIT |
| electron-builder 26.15.3 | Active, last push 2026-10-18 | MIT |

The main process (ESM) and the sandboxed preload (CommonJS) are bundled with `bun build`
(`desktop/build.ts`); no extra bundler.
