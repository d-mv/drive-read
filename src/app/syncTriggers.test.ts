import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useAuth } from '@/stores/auth'
import { useSync } from '@/stores/sync'
import { Ok, setupServices } from '@/stores/test-services'

import { startSyncTriggers } from './syncTriggers'

describe('syncTriggers', () => {
  beforeEach(async () => {
    sessionStorage.clear()
    localStorage.clear()
    setActivePinia(createPinia())
    const ctx = await setupServices()
    ctx.gis.requestToken.mockResolvedValue(
      Ok({ accessToken: 'tok', expiresAt: Date.now() + 3_600_000 }),
    )
  })

  it('pulls sync when document becomes visible and auth is connected', async () => {
    const auth = useAuth()
    const sync = useSync()
    await auth.connect()
    const syncNow = vi.spyOn(sync, 'syncNow').mockResolvedValue()

    startSyncTriggers()
    expect(syncNow).toHaveBeenCalledTimes(1) // on startup with connected auth

    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
    })
    document.dispatchEvent(new Event('visibilitychange'))

    expect(syncNow).toHaveBeenCalledTimes(2)
  })

  it('pushes pending changes with keepalive when document becomes hidden', async () => {
    const auth = useAuth()
    const sync = useSync()
    await auth.connect()
    const push = vi.spyOn(sync, 'push').mockResolvedValue()
    vi.spyOn(sync, 'pending', 'get').mockReturnValue(1)

    startSyncTriggers()

    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      configurable: true,
    })
    document.dispatchEvent(new Event('visibilitychange'))

    expect(push).toHaveBeenCalledWith({ keepalive: true })
  })

  it('does not pull sync when becoming visible if auth is disconnected', async () => {
    const sync = useSync()
    const syncNow = vi.spyOn(sync, 'syncNow').mockResolvedValue()

    startSyncTriggers()
    expect(syncNow).not.toHaveBeenCalled()

    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
    })
    document.dispatchEvent(new Event('visibilitychange'))

    expect(syncNow).not.toHaveBeenCalled()
  })

  it('does not push when becoming hidden if pending is 0', async () => {
    const auth = useAuth()
    const sync = useSync()
    await auth.connect()
    const push = vi.spyOn(sync, 'push').mockResolvedValue()
    vi.spyOn(sync, 'pending', 'get').mockReturnValue(0)

    startSyncTriggers()

    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      configurable: true,
    })
    document.dispatchEvent(new Event('visibilitychange'))

    expect(push).not.toHaveBeenCalled()
  })

  it('pulls sync when auth status becomes connected', async () => {
    const auth = useAuth()
    const sync = useSync()
    const syncNow = vi.spyOn(sync, 'syncNow').mockResolvedValue()

    startSyncTriggers()
    expect(syncNow).not.toHaveBeenCalled()

    await auth.connect()
    expect(syncNow).toHaveBeenCalledWith()
  })
})
