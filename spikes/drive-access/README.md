# Drive access spike

Throwaway page that answers the three "verify before building" questions in the
architecture doc. Not part of the app; delete once the answers are recorded.

Decision 2026-10-04: **no Google Picker**. The app uses the Drive API directly with
`drive.readonly` (restricted scope: fine for the owner and up to 100 test users behind the
unverified-app screen; public release needs Google's security assessment) plus `drive.appdata`.

| Question | How the page answers it |
|---|---|
| Can the app browse folders and download books with `drive.readonly`? | Step 2 browses from My Drive (click folders, click a book to download its first bytes); step 3 searches all of Drive for EPUB/PDF |
| Does the GIS popup work in an installed PWA on Android? | Step 1 from the installed app; the log shows the display mode |
| Does the CSP allow GIS and the Drive API? | Served with the app's CSP; every violation is logged |
| Do sync records work? | Step 4 writes, lists, reads and deletes a file in the appData folder |

## Run

1. Google Cloud: Drive API enabled; OAuth consent screen lists the scopes `drive.readonly` and
   `drive.appdata`, with your account as a test user; Web OAuth client with origin
   `http://localhost:5173`. No API key is needed.
2. Set `VITE_GOOGLE_CLIENT_ID` in the repo-root `.env`.
3. Free port 5173 (the OAuth origin), then from the repo root: `bun spikes/drive-access/serve.ts`
4. Open http://localhost:5173 and run steps 1–4. "Copy log" copies the results.

## Android (installed app)

localhost counts as a secure origin and is already authorized, so no deploy is needed:

1. Phone on USB with USB debugging on; in desktop Chrome open `chrome://inspect/#devices`.
2. Port forwarding: `5173` → `localhost:5173`, enabled.
3. On the phone open `http://localhost:5173`, menu → Install app / Add to Home screen.
4. Launch it from the home screen (the page should say "standalone") and run step 1.
