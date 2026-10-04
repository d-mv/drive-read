import { ref } from 'vue'

/**
 * Service worker updates (vite-plugin-pwa, prompt mode). A new worker waits; the library shows
 * "Update available". The app never reloads on its own while a book is open.
 */
export const updateAvailable = ref(false)
let apply: ((reload?: boolean) => Promise<void>) | null = null

export async function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
  const { registerSW } = await import('virtual:pwa-register')
  apply = registerSW({
    onNeedRefresh: () => (updateAvailable.value = true),
  })
}

export function applyUpdate() {
  void apply?.(true)
}
