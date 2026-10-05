import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { USER_KEY } from '@/app/identity'
import { logger } from '@/services/logger'

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

describe('identity in the logs', () => {
  it('after connecting, records the hashed account id and reports the connection', async () => {
    const info = vi.spyOn(logger, 'info')
    const setIdentity = vi.spyOn(logger, 'setIdentity')
    const { gis } = await setupServices()
    gis.requestToken.mockResolvedValue(
      Ok({ accessToken: 'tok', expiresAt: Date.now() + 3_600_000 }),
    )
    await useAuth().connect()
    await vi.waitFor(() =>
      expect(setIdentity).toHaveBeenCalledWith({ userId: 'u_ba7816bf8f01cfea' }),
    )
    expect(localStorage.getItem(USER_KEY)).toBe('u_ba7816bf8f01cfea')
    expect(info).toHaveBeenCalledWith('auth.connected', { first: true })
    vi.restoreAllMocks()
  })
})

describe('identity for accounts connected before identification existed', () => {
  it('identifies on restore when a valid token is kept but no user id was recorded', async () => {
    const setIdentity = vi.spyOn(logger, 'setIdentity')
    const { drive } = await setupServices()
    sessionStorage.setItem(
      'drive-read:token',
      JSON.stringify({ accessToken: 'tok', expiresAt: Date.now() + 3_600_000 }),
    )
    localStorage.setItem('drive-read:drive-connected', '1')
    useAuth().restore()
    await vi.waitFor(() =>
      expect(setIdentity).toHaveBeenCalledWith({ userId: 'u_ba7816bf8f01cfea' }),
    )
    expect(drive.aboutUser).toHaveBeenCalledWith('tok')
    vi.restoreAllMocks()
  })

  it('does not ask Drive again when the user id is already known', async () => {
    const { drive } = await setupServices()
    sessionStorage.setItem(
      'drive-read:token',
      JSON.stringify({ accessToken: 'tok', expiresAt: Date.now() + 3_600_000 }),
    )
    localStorage.setItem(USER_KEY, 'u_0123456789abcdef')
    useAuth().restore()
    await new Promise((r) => setTimeout(r, 10))
    expect(drive.aboutUser).not.toHaveBeenCalled()
  })
})
