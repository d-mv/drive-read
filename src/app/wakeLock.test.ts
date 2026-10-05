import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createWakeLock, IDLE_MS } from './wakeLock'

type Sentinel = { released: boolean; release: () => Promise<void> }

function fakeApi() {
  const sentinels: Sentinel[] = []
  const api = {
    request: vi.fn<(type: 'screen') => Promise<Sentinel>>(async () => {
      const s = {
        released: false,
        release: vi.fn<() => Promise<void>>(async () => {
          s.released = true
        }),
      }
      sentinels.push(s)
      return s
    }),
  }
  const held = () => sentinels.filter((s) => !s.released).length
  return { api, held, sentinels }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('reading wake lock', () => {
  it('keeps the screen on while reading and releases it when reading stops', async () => {
    const { api, held } = fakeApi()
    const lock = createWakeLock(api)
    await lock.start()
    expect(api.request).toHaveBeenCalledWith('screen')
    expect(held()).toBe(1)
    await lock.stop()
    expect(held()).toBe(0)
  })

  it('lets the screen sleep after idle minutes without a page turn, and takes it back on the next', async () => {
    const { api, held } = fakeApi()
    const lock = createWakeLock(api)
    await lock.start()
    await vi.advanceTimersByTimeAsync(IDLE_MS - 1000)
    await lock.activity()
    await vi.advanceTimersByTimeAsync(IDLE_MS - 1000)
    expect(held()).toBe(1)
    await vi.advanceTimersByTimeAsync(2000)
    expect(held()).toBe(0)
    await lock.activity()
    expect(held()).toBe(1)
    await lock.stop()
  })

  it('takes the lock back when the tab is shown again (the browser drops it on hide)', async () => {
    const { api, held, sentinels } = fakeApi()
    const lock = createWakeLock(api)
    await lock.start()
    sentinels[0]!.released = true // browser released it on hide
    await lock.visible()
    expect(held()).toBe(1)
    await lock.stop()
  })

  it('does nothing where the Wake Lock API is missing or refused', async () => {
    const lock = createWakeLock(undefined)
    await expect(lock.start()).resolves.toBeUndefined()
    const refusing = {
      request: vi.fn<(type: 'screen') => Promise<never>>(async () =>
        Promise.reject(new Error('NotAllowedError')),
      ),
    }
    await expect(createWakeLock(refusing).start()).resolves.toBeUndefined()
  })
})
