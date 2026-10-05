import { track } from '@/services/events'
import { logger } from '@/services/logger'

import type { Device } from './device'
import { deviceLabel, loadUserId } from './identity'

/**
 * Observability wiring (OBSERVABILITY.md): who the events are about (pseudonymous), app start
 * timing, uncaught errors and CSP violations. Nothing here sends titles, URLs paths or emails.
 */

/** Only the origin or the kind of a blocked resource: a path or blob URL could name a book. */
export function blockedOrigin(uri: string): string {
  if (!uri || uri === 'inline') return 'inline'
  if (uri === 'eval' || uri === 'wasm-eval') return uri
  if (uri.startsWith('blob:')) return 'blob'
  if (uri.startsWith('data:')) return 'data'
  try {
    return new URL(uri).origin
  } catch {
    return 'other'
  }
}

/** "reader-Ab12.js:3": enough to find the chunk and line, no origin. */
export function errorSource(
  file: string | undefined,
  line: number | undefined,
  _col: number | undefined,
): string {
  if (!file) return 'unknown'
  const name = file.split('/').pop() || file
  return line ? `${name}:${line}` : name
}

const short = (s: unknown) => String(s ?? '').slice(0, 300)

/** Browser notices that are not crashes: logging them would bury real errors. */
export const isBenignError = (message: string) => message.startsWith('ResizeObserver loop')

/** A Vue render, setup or handler error (these never reach window.onerror). */
export function vueErrorEvent(err: unknown, info: string): { message: string; source: string } {
  const message = err instanceof Error ? err.message : String(err)
  return { message: short(message), source: `vue:${info}` }
}

export function startObservability(device: Device) {
  logger.setIdentity({ device: deviceLabel(device), userId: loadUserId() })

  addEventListener('error', (e) => {
    if (isBenignError(String(e.message ?? ''))) return
    track('error.uncaught', {
      message: short(e.message),
      source: errorSource(e.filename, e.lineno, e.colno),
    })
  })
  addEventListener('unhandledrejection', (e) => {
    const reason = e.reason as { message?: string } | undefined
    track('error.uncaught', { message: short(reason?.message ?? e.reason), source: 'promise' })
  })
  document.addEventListener('securitypolicyviolation', (e) => {
    track('csp.violation', {
      directive: e.effectiveDirective,
      blocked: blockedOrigin(e.blockedURI),
    })
  })
}

export function reportStarted(books: number) {
  track('app.started', {
    books,
    boot_ms: performance.now(),
    installed: matchMedia('(display-mode: standalone)').matches,
    online: navigator.onLine,
    sw_controlled: !!navigator.serviceWorker?.controller,
  })
}
