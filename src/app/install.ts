import { ref } from 'vue'

/**
 * Installing the app. Chromium browsers fire `beforeinstallprompt`: it is kept and replayed
 * from our own "Install app" button. iOS Safari has no prompt, so it gets a short hint.
 */

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/** iOS Safari (not Chrome/Firefox on iOS), not already running as an installed app. */
export function needsIosHint(userAgent: string, standalone: boolean): boolean {
  if (standalone) return false
  const ios = /iPhone|iPad|iPod/.test(userAgent)
  const otherBrowser = /CriOS|FxiOS|EdgiOS|OPiOS/.test(userAgent)
  return ios && !otherBrowser && /Safari/.test(userAgent)
}

const isStandalone = () =>
  matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true

/** The browser offered to install; `install()` shows its dialog. */
export const canInstall = ref(false)
export const iosHint = ref(false)
let deferred: InstallPromptEvent | null = null

export function startInstallWatch() {
  iosHint.value = needsIosHint(navigator.userAgent, isStandalone())
  addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferred = e as InstallPromptEvent
    canInstall.value = true
  })
  addEventListener('appinstalled', () => {
    deferred = null
    canInstall.value = false
    iosHint.value = false
  })
}

export async function install() {
  if (!deferred) return
  await deferred.prompt()
  await deferred.userChoice.catch(() => null)
  deferred = null
  canInstall.value = false
}
