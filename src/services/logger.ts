/**
 * Logger API client (~/.agents/contracts/logger): batched, fire-and-forget, never throws.
 * Events are buffered and sent as one array every `flushMs` or at `maxBatch` events; one retry on
 * a network error, none on an HTTP error. Never pass tokens or book content in `context`.
 */

type Level = 'debug' | 'info' | 'warn' | 'error'
type Context = Record<string, string | number | boolean | null>

interface LoggerOptions {
  baseUrl: string
  ingestKey: string
  env: string
  appVersion: string
  sessionId: string
  fetch?: (url: string, init: RequestInit) => Promise<Response>
  now?: () => Date
  flushMs?: number
  maxBatch?: number
}

interface Event {
  timestamp: string
  level: Level
  message: string
  env: string
  app_version: string
  session_id: string
  platform: 'web'
  device?: string
  user_id?: string
  context?: Context
}

/** Who the events are about: never an email or name, only random or hashed ids. */
export interface Identity {
  /** Random per-browser id and its kind, e.g. "a3f9c2e1/Phone". */
  device?: string | null
  /** Hash of the Google account's Drive permission id, e.g. "u_0123456789abcdef". */
  userId?: string | null
}

export function createLogger(opts: LoggerOptions) {
  const doFetch = opts.fetch ?? ((url: string, init: RequestInit) => fetch(url, init))
  const now = opts.now ?? (() => new Date())
  const flushMs = opts.flushMs ?? 5000
  const maxBatch = opts.maxBatch ?? 20
  const enabled = Boolean(opts.baseUrl && opts.ingestKey)

  let buffer: Event[] = []
  let identity: { device?: string; userId?: string } = {}
  let timer: ReturnType<typeof setTimeout> | undefined

  async function send(batch: Event[], keepalive: boolean, retry: boolean): Promise<void> {
    try {
      await doFetch(`${opts.baseUrl}/v1/ingest`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-ingest-key': opts.ingestKey },
        body: JSON.stringify(batch),
        keepalive,
      })
    } catch {
      if (retry) setTimeout(() => void send(batch, keepalive, false), 1000)
    }
  }

  async function flush(o: { keepalive?: boolean } = {}): Promise<void> {
    clearTimeout(timer)
    timer = undefined
    if (buffer.length === 0) return
    const batch = buffer.slice(0, 100)
    buffer = buffer.slice(100)
    await send(batch, o.keepalive ?? false, true)
  }

  function log(level: Level, message: string, context?: Context) {
    if (import.meta.env.DEV)
      console[level === 'debug' ? 'log' : level](`[${level}] ${message}`, context ?? '')
    if (!enabled) return
    buffer.push({
      timestamp: now().toISOString(),
      level,
      message,
      env: opts.env,
      app_version: opts.appVersion,
      session_id: opts.sessionId,
      platform: 'web',
      ...(identity.device ? { device: identity.device } : {}),
      ...(identity.userId ? { user_id: identity.userId } : {}),
      ...(context ? { context } : {}),
    })
    if (buffer.length >= maxBatch) void flush()
    else timer ??= setTimeout(() => void flush(), flushMs)
  }

  /** Applies to events logged from now on. A key set to null clears it; a missing key is kept. */
  function setIdentity(next: Identity) {
    const merged = { ...identity }
    if (next.device !== undefined) merged.device = next.device ?? undefined
    if (next.userId !== undefined) merged.userId = next.userId ?? undefined
    identity = merged
  }

  return {
    setIdentity,
    debug: (m: string, c?: Context) => log('debug', m, c),
    info: (m: string, c?: Context) => log('info', m, c),
    warn: (m: string, c?: Context) => log('warn', m, c),
    error: (m: string, c?: Context) => log('error', m, c),
    flush,
  }
}

export type Logger = ReturnType<typeof createLogger>

/** The app's logger. Sends nothing until VITE_LOGGER_INGEST_KEY is set. */
export const logger = createLogger({
  baseUrl: import.meta.env.VITE_LOGGER_API_BASE_URL ?? '',
  ingestKey: import.meta.env.VITE_LOGGER_INGEST_KEY ?? '',
  env: import.meta.env.MODE,
  appVersion: typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'test',
  sessionId: crypto.randomUUID(),
})

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void logger.flush({ keepalive: true })
  })
}
