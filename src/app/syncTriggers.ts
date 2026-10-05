import { watch } from 'vue'

import { useAuth } from '@/stores/auth'
import { useSync } from '@/stores/sync'

/**
 * When sync runs (architecture doc, "Progress sync"): pull on start, back online and after a
 * (re)connect; push with keepalive when the tab is hidden. Page turns nudge the idle timer
 * (stores/library.saveProgress); opening a book pulls (views/ReaderView).
 */
export function startSyncTriggers() {
  const sync = useSync()
  const auth = useAuth()

  if (auth.status === 'connected') void sync.syncNow()

  addEventListener('online', () => void sync.syncNow())

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && sync.pending > 0)
      void sync.push({ keepalive: true })
  })

  watch(
    () => auth.status,
    (now, before) => {
      if (now === 'connected' && before !== 'connected') void sync.syncNow()
    },
  )
}
