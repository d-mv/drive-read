# Implementation notes

Conservative choices and deviations from the architecture doc, newest first.

## 2026-10-04 — Drive access spike

- The Kairos project is under the **Apps** area: no "Projects" area exists, and every other app lives in Apps.
- The spike (`spikes/drive-access/`) is a Bun server plus one TS file, with no Vite or Vue, so it stays isolated from the app build.
- The spike uses the doc's CSP **verbatim**. Any violations it reports feed the CSP task; the spike does not patch around them.
- The app name is set to **Drive Read**. The architecture doc and the UI canvas still show it as open; there is a Kairos task to update them.
- Logging: when the Logger ingest key ships in a client-only bundle, it is public. That risk is noted on the Logger Kairos task. Registering the key in logger-api needs a logger-api redeploy, so it waits for confirmation.
