import { ref } from 'vue'

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

let apply: ((reload?: boolean) => Promise<void>) | null = null

export async function registerServiceWorker() {
  const change = noteVersion(appVersion)
  if (change.kind === 'updated') updatedTo.value = change.to
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return

  const { registerSW } = await import('virtual:pwa-register')
  apply = registerSW({
    onNeedRefresh: () => (updateAvailable.value = true),
    onOfflineReady: () => (offlineReady.value = change.kind === 'first-run'),
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

/** Activates the waiting version and reloads. The URL keeps the open book; its place is saved. */
export function applyUpdate() {
  void apply?.(true)
}
