# Drive access spike

Throwaway page that answers the three "verify before building" questions in the
architecture doc. Not part of the app; delete once the answers are recorded.

| Question | How the page answers it |
|---|---|
| Does picking a folder under `drive.file` grant access to its files? | Pick a folder → lists its children, downloads the first bytes of up to 3 books, probes one subfolder |
| Does the GIS popup work in an installed PWA on Android? | Step 1 from the installed app; the log shows the display mode |
| Does the proposed CSP allow GIS, the Picker and the Drive API? | Served with the doc's CSP verbatim; every violation is logged |

## Run

1. Google Cloud: Drive API + Picker API enabled, a Web OAuth client with origin
   `http://localhost:5173`, an API key restricted to that origin.
2. Fill `VITE_GOOGLE_*` in the repo-root `.env` (see `.env.example`).
3. Free port 5173 (the OAuth origin), then from the repo root: `bun spikes/drive-access/serve.ts`
4. Open http://localhost:5173 and run steps 1–3. "Copy log" copies the results.

Pick a folder you know holds EPUB/PDF files you have **not** picked before,
otherwise earlier per-file grants make the folder look like it works.

## Android (installed app)

localhost counts as a secure origin and is already authorized, so no deploy is needed:

1. Phone on USB with USB debugging on; in desktop Chrome open `chrome://inspect/#devices`.
2. Port forwarding: `5173` → `localhost:5173`, enabled.
3. On the phone open `http://localhost:5173`, menu → Install app / Add to Home screen.
4. Launch it from the home screen (the page should say "standalone") and run step 1.
