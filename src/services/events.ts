import { logger } from './logger'

/**
 * The event catalogue (OBSERVABILITY.md): every measurement the app reports, by name, with its
 * fields. `track` only accepts these, so dashboards and queries can rely on the names and fields.
 * Fields are counts, durations, kinds and reasons: never titles, file names, tokens or emails.
 */

type Format = 'epub' | 'pdf'
type Source = 'local' | 'drive'

export interface Events {
  'app.started': {
    browser: string
    books: number
    boot_ms: number
    installed: boolean
    online: boolean
    sw_controlled: boolean
  }
  'auth.connected': { first: boolean }
  'auth.connect_failed': { reason: string }
  'auth.expired': { where: string }
  'library.imported': { source: Source; added: number; failed: number; reason: string | null }
  'library.removed': { source: Source }
  'library.download_removed': { format: Format; bytes: number }
  'drive.checked': {
    ms: number
    books: number
    missing: number
    new_versions: number
    complete: boolean
  }
  'drive.check_failed': { reason: string }
  'book.opened': { format: Format; source: Source; ms: number; downloaded_now: boolean }
  'book.open_failed': { reason: string; format: Format | null; source: Source | null }
  'book.downloaded': { format: Format; bytes: number; ms: number }
  'reading.session': {
    format: Format
    source: Source
    minutes: number
    pages: number
    from: number
    to: number
  }
  'drive.listed': { kind: string; ms: number; files: number | null; stale: boolean }
  'sync.completed': {
    ms: number
    pushed: number
    adopted: number
    offered: number
    library_changes: number
  }
  'sync.failed': { reason: string; pending: number }
  'storage.write_failed': { what: string; reason: string }
  'storage.evicted': { books: number }
  'storage.persisted': { granted: boolean; usage_mb: number; quota_mb: number }
  'pwa.update_available': Record<string, never>
  'pwa.update_applied': { waiting: boolean; controlled: boolean }
  'pwa.reloading': { trigger: string }
  'pwa.updated': { from: string; to: string }
  'pwa.offline_ready': Record<string, never>
  'pwa.install_prompted': Record<string, never>
  'pwa.install_result': { outcome: string }
  'pwa.installed': Record<string, never>
  'error.uncaught': { message: string; source: string }
  'csp.violation': { directive: string; blocked: string }
}

export type EventName = keyof Events

const level = (name: EventName): 'info' | 'warn' | 'error' =>
  name.startsWith('error.') ? 'error' : /[._]failed$|\.expired$|^csp\./.test(name) ? 'warn' : 'info'

const tidy = (props: object) =>
  Object.fromEntries(
    Object.entries(props).map(([k, v]) => [
      k,
      typeof v === 'number' && (k === 'ms' || k.endsWith('_ms')) ? Math.round(v) : v,
    ]),
  ) as Record<string, string | number | boolean | null>

export function track<K extends EventName>(name: K, props: Events[K]): void {
  logger[level(name)](name, tidy(props))
}
