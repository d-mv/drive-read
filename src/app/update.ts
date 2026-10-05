import { ref } from 'vue'

import { track } from '@/services/events'
import { logger } from '@/services/logger'

/**
 * Service worker updates (vite-plugin-pwa, prompt mode). A new worker waits until the reader
 * chooses Reload; the app never reloads on its own, so a book is never pulled away mid-page.
 * Checks run on start, when the tab is shown again, when back online, and hourly while open,
 * so an installed app left open for days still learns about new versions.
 */

export const VERSION_KEY = 'drive-read:version'
const CHECK_EVERY_MS = 60 * 60 * 1000

export const appVersion: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev'

/** A new version is installed and waiting. */
export const updateAvailable = ref(false)
/** The first install finished: the app now works offline. */
export const offlineReady = ref(false)
/** Reload was tapped: activating the new version can take a few seconds on a phone. */
export const updating = ref(false)
/** This run is the first since an update to this version. */
export const updatedTo = ref<string | null>(null)

export type VersionChange =
  | { kind: 'first-run' }
  | { kind: 'updated'; from: string; to: string }
  | { kind: 'same' }

/** Compares with the version that ran last on this device, and records the current one. */
export function noteVersion(current: string): VersionChange {
  try {
    const previous = localStorage.getItem(VERSION_KEY)
    if (previous === current) return { kind: 'same' }
    localStorage.setItem(VERSION_KEY, current)
    return previous ? { kind: 'updated', from: previous, to: current } : { kind: 'first-run' }
  } catch {
    return { kind: 'same' }
  }
}

export async function registerServiceWorker() {
  const change = noteVersion(appVersion)
  if (change.kind === 'updated') {
    updatedTo.value = change.to
    track('pwa.updated', { from: change.from, to: change.to })
  }
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return

  const { registerSW } = await import('virtual:pwa-register')
  registerSW({
    onNeedRefresh: () => {
      updateAvailable.value = true
      track('pwa.update_available', {})
    },
    onOfflineReady: () => {
      offlineReady.value = change.kind === 'first-run'
      track('pwa.offline_ready', {})
    },
    onRegisteredSW: (_url, registration) => {
      if (!registration) return
      const check = () => {
        if (navigator.onLine && !registration.installing) void registration.update().catch(() => {})
      }
      setInterval(check, CHECK_EVERY_MS)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check()
      })
      addEventListener('online', check)
    },
  })
}

interface WaitingWorker {
  state: string
  postMessage(message: unknown): void
  addEventListener(type: 'statechange', cb: () => void): void
}
interface ServiceWorkers {
  controller: unknown
  getRegistration(): Promise<{ waiting: WaitingWorker | null } | undefined>
  addEventListener(type: 'controllerchange', cb: () => void, opts?: { once: boolean }): void
}

/** If the browser never reports the switch, reload anyway after this long. */
const RELOAD_FALLBACK_MS = 4000

/**
 * Makes the waiting version take over and reloads exactly once: when it is activated, when the
 * page's controller changes, at once if nothing is waiting (an earlier tap already activated it),
 * or after RELOAD_FALLBACK_MS. Does not rely on vite-plugin-pwa's reload path, which did not
 * reload on the owner's phone (logs: six taps, no reload).
 */
export async function activateWaiting(sw: ServiceWorkers, reload: (trigger: string) => void) {
  let done = false
  const once = (trigger: string) => {
    if (done) return
    done = true
    reload(trigger)
  }
  sw.addEventListener('controllerchange', () => once('controllerchange'), { once: true })
  const waiting = (await sw.getRegistration().catch(() => undefined))?.waiting ?? null
  track('pwa.update_applied', { waiting: !!waiting, controlled: !!sw.controller })
  if (!waiting) return once('no-waiting')
  waiting.addEventListener('statechange', () => {
    if (waiting.state === 'activated') once('activated')
  })
  waiting.postMessage({ type: 'SKIP_WAITING' })
  setTimeout(() => once('timeout'), RELOAD_FALLBACK_MS)
}

const reloadPage = (trigger: string) => {
  track('pwa.reloading', { trigger })
  void logger.flush({ keepalive: true })
  location.reload()
}

/** Activates the waiting version and reloads. The URL keeps the open book; its place is saved. */
export function applyUpdate(reload: (trigger: string) => void = reloadPage) {
  // One tap is enough: logs showed repeated taps while the phone was still activating.
  if (updating.value) return
  updating.value = true
  const sw = 'serviceWorker' in navigator ? navigator.serviceWorker : null
  if (!sw) return reload('no-service-worker')
  void activateWaiting(sw, reload)
}

/** Coarse browser family for the logs (debugging platform-specific behaviour); nothing finer. */
export function browserKind(ua: string): string {
  if (/iPhone|iPad|iPod/.test(ua))
    return /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua) ? 'ios-other' : 'ios-safari'
  if (/Android/.test(ua))
    return /Chrome\//.test(ua) && !/SamsungBrowser|EdgA|OPR|Firefox/.test(ua)
      ? 'android-chrome'
      : 'android-other'
  if (/Firefox\//.test(ua)) return 'desktop-firefox'
  if (/Edg\//.test(ua)) return 'desktop-edge'
  if (/Chrome\//.test(ua)) return 'desktop-chrome'
  if (/Version\/.*Safari/.test(ua)) return 'desktop-safari'
  return 'other'
}
