import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { Err, None, Ok, Some } from '@/shared/result'

import { useAuth } from './auth'
import { setupServices } from './test-services'

beforeEach(() => {
  setActivePinia(createPinia())
  sessionStorage.clear()
  localStorage.clear()
})

describe('auth', () => {
  it('starts disconnected', async () => {
    await setupServices()
    const auth = useAuth()
    auth.restore()
    expect(auth.status).toBe('disconnected')
    expect(auth.validToken()).toEqual(None)
  })

  it('connects and keeps the token for this tab', async () => {
    const { gis } = await setupServices()
    gis.requestToken.mockResolvedValue(
      Ok({ accessToken: 'tok', expiresAt: Date.now() + 3_600_000 }),
    )
    const auth = useAuth()
    expect(await auth.connect()).toBe(true)
    expect(auth.status).toBe('connected')
    expect(auth.validToken()).toEqual(Some('tok'))

    setActivePinia(createPinia())
    const reloaded = useAuth()
    reloaded.restore()
    expect(reloaded.validToken()).toEqual(Some('tok'))
  })

  it('reports why connecting failed', async () => {
    const { gis } = await setupServices()
    gis.requestToken.mockResolvedValue(Err({ kind: 'popup-blocked' }))
    const auth = useAuth()
    expect(await auth.connect()).toBe(false)
    expect(auth.error).toEqual({ kind: 'popup-blocked' })
    expect(auth.status).toBe('disconnected')
  })

  it('treats a token near its expiry as expired', async () => {
    const { gis } = await setupServices()
    gis.requestToken.mockResolvedValue(Ok({ accessToken: 'tok', expiresAt: Date.now() + 30_000 }))
    const auth = useAuth()
    await auth.connect()
    expect(auth.validToken()).toEqual(None)
    expect(auth.status).toBe('expired')
  })

  it('markExpired drops the token after a 401', async () => {
    const { gis } = await setupServices()
    gis.requestToken.mockResolvedValue(
      Ok({ accessToken: 'tok', expiresAt: Date.now() + 3_600_000 }),
    )
    const auth = useAuth()
    await auth.connect()
    auth.markExpired()
    expect(auth.status).toBe('expired')
    expect(sessionStorage.length).toBe(0)
  })
})
