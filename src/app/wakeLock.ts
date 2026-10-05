import { IDLE_MS } from '@/domain/reading'

export { IDLE_MS }

/**
 * Keeps the screen on while reading (owner task "wake lock"). To spare the battery, the lock is
 * released after IDLE_MS without a page turn and taken again on the next one. The browser drops
 * the lock when the tab is hidden; `visible()` takes it back. Missing API or refusal: no-op.
 */

interface Sentinel {
  released: boolean
  release(): Promise<void>
}
interface WakeLockApi {
  request(type: 'screen'): Promise<Sentinel>
}

export function createWakeLock(api: WakeLockApi | undefined) {
  let reading = false
  let sentinel: Sentinel | null = null
  let timer: ReturnType<typeof setTimeout> | undefined

  const held = () => !!sentinel && !sentinel.released

  async function acquire() {
    if (!api || held()) return
    try {
      sentinel = await api.request('screen')
    } catch {
      sentinel = null // not allowed (battery saver, no user gesture yet): reading goes on
    }
  }

  async function release() {
    const s = sentinel
    sentinel = null
    if (s && !s.released) await s.release().catch(() => {})
  }

  function armIdle() {
    clearTimeout(timer)
    timer = setTimeout(() => void release(), IDLE_MS)
  }

  return {
    async start() {
      reading = true
      await acquire()
      armIdle()
    },
    /** A page turn: the reader is here. */
    async activity() {
      if (!reading) return
      await acquire()
      armIdle()
    },
    /** The tab is shown again after the browser dropped the lock. */
    async visible() {
      if (!reading) return
      await acquire()
      armIdle()
    },
    async stop() {
      reading = false
      clearTimeout(timer)
      await release()
    },
  }
}

export const browserWakeLock = () => (navigator as Navigator & { wakeLock?: WakeLockApi }).wakeLock
