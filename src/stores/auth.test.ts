import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { USER_KEY } from '@/app/identity'
import type { DriveFile } from '@/services/drive/client'
import { logger } from '@/services/logger'

import { Err, None, Ok, Some } from '@/shared/result'

import { useAuth } from './auth'
import { useLibrary } from './library'
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
      expect(setIdentity).toHaveBeenCalledWith({ userId: 'u_659b68cd6dbb8530' }),
    )
    expect(localStorage.getItem(USER_KEY)).toBe('u_659b68cd6dbb8530')
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
      expect(setIdentity).toHaveBeenCalledWith({ userId: 'u_659b68cd6dbb8530' }),
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

describe('connecting a different Google account on this device', () => {
  const book: DriveFile = {
    id: 'book-a',
    name: 'Middlemarch - George Eliot.epub',
    mimeType: 'application/epub+zip',
    size: 1048576,
    md5: null,
    modifiedTime: '',
  }
  /** Account A ('abc') was connected before 0.23.4 (unsalted id) and has a synced book here. */
  async function signedInBefore() {
    const ctx = await setupServices()
    localStorage.setItem(USER_KEY, 'u_ba7816bf8f01cfea')
    localStorage.setItem('drive-read:drive-connected', '1')
    await useLibrary().addFromDrive([book])
    ctx.gis.requestToken.mockResolvedValue(
      Ok({ accessToken: 'tok', expiresAt: Date.now() + 3_600_000 }),
    )
    return ctx
  }

  it('keeps the library when the same account connects again, without asking', async () => {
    await signedInBefore()
    // The stored id is the old unsalted form: still the same account, now stored salted.
    const ask = vi.fn<() => boolean>(() => true)
    vi.stubGlobal('confirm', ask)
    expect(await useAuth().connect()).toBe(true)
    expect(ask).not.toHaveBeenCalled()
    expect(useLibrary().books.map((b) => b.id)).toEqual(['book-a'])
    expect(localStorage.getItem(USER_KEY)).toBe('u_659b68cd6dbb8530')
    vi.unstubAllGlobals()
  })

  it('asks first, and cancelling keeps the library and takes no token', async () => {
    const { drive, services } = await signedInBefore()
    drive.aboutUser.mockResolvedValue(Ok({ permissionId: 'other' }))
    const ask = vi.fn<() => boolean>(() => false)
    vi.stubGlobal('confirm', ask)
    const auth = useAuth()
    expect(await auth.connect()).toBe(false)
    expect(ask).toHaveBeenCalledOnce()
    expect(auth.validToken()).toEqual(None)
    expect(sessionStorage.getItem('drive-read:token')).toBeNull()
    expect(localStorage.getItem(USER_KEY)).toBe('u_ba7816bf8f01cfea')
    expect(useLibrary().books.map((b) => b.id)).toEqual(['book-a'])
    expect((await services.db.getSyncMeta())._tag).toBe('Some')
    vi.unstubAllGlobals()
  })

  it('once confirmed, clears this device so nothing of the old account syncs into the new one', async () => {
    const { drive, services, blobs } = await signedInBefore()
    drive.aboutUser.mockResolvedValue(Ok({ permissionId: 'other' }))
    vi.stubGlobal(
      'confirm',
      vi.fn<() => boolean>(() => true),
    )
    const auth = useAuth()
    expect(await auth.connect()).toBe(true)
    expect(auth.validToken()).toEqual(Some('tok'))
    expect(useLibrary().books).toEqual([])
    expect(await services.db.allBooks()).toEqual([])
    const meta = await services.db.getSyncMeta()
    expect(meta._tag === 'Some' ? meta.value.library.entries : 'none').toEqual([])
    expect([...blobs.paths()]).toEqual([])
    expect(localStorage.getItem(USER_KEY)).not.toBe('u_ba7816bf8f01cfea')
    vi.unstubAllGlobals()
  })
})
