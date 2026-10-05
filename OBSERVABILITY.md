# Observability

Drive Read reports **named events with measurements** to Logger API (project `drive-read`).
The catalogue lives in code, in `src/services/events.ts`: `track(name, fields)` only accepts the
names and fields below, so queries can rely on them.

## Who an event is about

| Field | Value | Personal data |
|---|---|---|
| `device` | Random per-browser id and its kind, e.g. `a3f9c2e1/Phone`, kept in localStorage (`drive-read:device`) | None |
| `user_id` | `u_` + the first 16 hex digits of SHA-256 of the Google account's Drive **permission id**, set after connecting and kept for offline sessions (`drive-read:user`) | Pseudonymous: never the email or name |
| `session_id` | Random per page load | None |
| `app_version`, `env`, `platform` | Build version, `production` or `development`, `web` | None |

To find one person's events, compute their id the same way (`userIdFromPermission` in
`src/app/identity.ts`) from their Drive permission id. Events never carry titles, file names,
URLs with paths, tokens or emails.

## Events

| Event | Level | Fields | Answers |
|---|---|---|---|
| `app.started` | info | `books`, `boot_ms`, `installed`, `online`, `sw_controlled` | Active devices and users, start speed, installed vs browser |
| `auth.connected` | info | `first` | Drive connections, first-time vs returning |
| `auth.connect_failed` | warn | `reason` (`popup-blocked`, `popup-closed`, `denied`, `scopes-missing`, `unavailable`) | Why sign-in fails |
| `auth.expired` | warn | `where` (`expiry`, `sync`, `download`, `drive-browser`) | How often access lapses mid-use |
| `library.imported` | info | `source` (`local`, `drive`), `added`, `failed`, `reason` | Books added per source, import failures |
| `library.removed` | info | `source` | Removals |
| `book.opened` | info | `format`, `source`, `ms`, `downloaded_now` | Time to open, with and without download |
| `book.open_failed` | warn | `reason`, `format`, `source` | Broken, missing, offline, needs reconnect |
| `book.downloaded` | info | `format`, `bytes`, `ms` | Download size and speed |
| `reading.session` | info | `format`, `source`, `minutes`, `pages`, `from`, `to` | Real reading time and progress; sent on close and when the tab is hidden |
| `drive.listed` | info | `kind` (`search`, `folder`), `ms`, `files`, `stale` | Drive browsing speed; `stale` = answer dropped as outdated |
| `sync.completed` | info | `ms`, `pushed`, `adopted`, `offered`, `library_changes` | Sync health and volume; `offered` = conflicts and newer positions offered |
| `sync.failed` | warn | `reason`, `pending` | Sync failures and the backlog they leave |
| `storage.persisted` | info | `granted`, `usage_mb`, `quota_mb` | Whether the browser keeps books under pressure, space used |
| `storage.write_failed` | warn | `what` (`progress`, `book`), `reason` (`quota`, `unknown`) | Lost writes |
| `pwa.update_available`, `pwa.update_applied`, `pwa.updated` (`from`, `to`), `pwa.offline_ready` | info | | Update uptake: offered → applied → running |
| `pwa.install_prompted`, `pwa.install_result` (`outcome`), `pwa.installed` | info | | Install funnel |
| `error.uncaught` | error | `message` (≤300 chars), `source` (`chunk.js:line` or `promise`) | Crashes |
| `csp.violation` | warn | `directive`, `blocked` (origin or kind only) | Blocked content, e.g. scripts inside books (`blob`) |

## Asking questions

Use the Logger MCP tools with project `drive-read`:

- `get_recent_logs` for the raw stream (filter by `message` = event name, or by `user_id` / `device`).
- `analyze_logs` for summaries, e.g. "count `book.open_failed` by `reason`", "median `book.opened.ms`
  by `format` and `downloaded_now`", "sum `reading.session.minutes` per `user_id`".

Retention on Logger API is **7 days** (`LOG_RETENTION_DAYS`). Trends over longer periods need longer
retention or a periodic aggregate.

## Rules for new events

1. Add the event and its fields to `Events` in `src/services/events.ts` and to this table.
2. Fields are counts, durations (`ms`, rounded), kinds and reasons. No titles, names, paths or tokens.
3. Failures end in `.failed`/`_failed` or `.expired` (logged as `warn`); crashes start with `error.`.
4. Unit tests assert the events of each store (`src/stores/*.test.ts`).
