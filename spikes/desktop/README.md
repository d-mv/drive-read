# Desktop spike (phase 0)

Answers one question from [`docs/DESKTOP.md`](../../docs/DESKTOP.md): does the unchanged web build
run in Electron when served from `app://drive-read/`? Not part of the app; delete it once the
desktop shell (phase 1) replaces it.

`main.ts` serves `dist/` through a privileged `app://` scheme with the production CSP from
`csp.ts`, in an isolated, sandboxed window with no preload.

## Result (2026-10-19, Electron 44.9.0)

| Check | Result |
| --- | --- |
| EPUB opens (foliate-js), pages turn | Pass |
| Book, cover and position survive an app restart (IndexedDB + OPFS on `app://`) | Pass |
| PDF opens (pdf.js, its worker, WebAssembly decoders) | Pass |
| CSP violations | None |
| Service worker | Not registered on `app://` (scheme has no `allowServiceWorkers`); no error |

The console shows foliate's "allow-scripts and allow-same-origin" iframe warning, as in Chrome;
book scripts stay blocked by the CSP.

## Run

```sh
VITE_LOGGER_INGEST_KEY= VITE_GOOGLE_CLIENT_ID=e2e-client bunx vite build
bun spikes/desktop/build.ts
bunx playwright test -c spikes/desktop     # automated check
bunx electron spikes/desktop/out/main.mjs  # try it by hand
```
