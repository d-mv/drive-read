import { createPinia, type Pinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { provideServices } from '@/services'
import { logger } from '@/services/logger'
import type { DriveFile } from '@/services/drive/client'
import type { Position } from '@/services/engine/types'

import { useAuth } from './auth'
import { useLibrary } from './library'
import { useReader } from './reader'
import { useSync } from './sync'
import {
  type MemoryAppData,
  memoryAppData,
  Ok,
  setupServices,
  type TestContext,
} from './test-services'

/** One simulated device: its own pinia, local DB and blobs; the Drive app folder is shared. */
interface Device {
  ctx: TestContext
  pinia: Pinia
}

async function device(appdata: MemoryAppData, name: string): Promise<Device> {
  const pinia = createPinia()
  setActivePinia(pinia)
  const ctx = await setupServices({ appdata, device: { id: name.toLowerCase(), name } })
  ctx.gis.requestToken.mockResolvedValue(
    Ok({ accessToken: 'tok', expiresAt: Date.now() + 3_600_000 }),
  )
  await useAuth().connect()
  await useSync().load()
  return { ctx, pinia }
}

function on(d: Device) {
  setActivePinia(d.pinia)
  provideServices(d.ctx.services)
}

const driveFile = (id: string): DriveFile => ({
  id,
  name: `Book ${id}.epub`,
  mimeType: 'application/epub+zip',
  size: 10,
  md5: `md5-${id}`,
  modifiedTime: '',
})

const at = (fraction: number): Position => ({
  locator: { kind: 'cfi', cfi: `epubcfi(/6/4!/4/2/1:${Math.round(fraction * 100)})` },
  fraction,
  chapterIndex: 0,
  chapterFraction: fraction,
})

const progressFiles = (a: MemoryAppData) =>
  [...a.files.values()].filter((f) => f.name.startsWith('progress-')).map((f) => f.name)

beforeEach(() => {
  sessionStorage.clear()
  localStorage.clear()
})
afterEach(() => vi.useRealTimers())

describe('push', () => {
  it('pushes a Drive book position 20 s after the last page turn', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const appdata = memoryAppData()
    await device(appdata, 'Laptop')
    await useLibrary().addFromDrive([driveFile('b1')])
    await useLibrary().saveProgress('b1', at(0.3))
    await vi.advanceTimersByTimeAsync(10_000)
    await useLibrary().saveProgress('b1', at(0.31))
    await vi.advanceTimersByTimeAsync(19_000)
    expect(progressFiles(appdata)).toEqual([])

    await vi.advanceTimersByTimeAsync(1_500)
    await vi.waitFor(() => expect(progressFiles(appdata)).toEqual(['progress-b1.json']))
    expect(useLibrary().progress.b1).toMatchObject({ dirty: false, remoteId: expect.any(String) })
    expect(useSync().pending).toBe(0)
  })

  it('never syncs books opened from a local file', async () => {
    const appdata = memoryAppData()
    await device(appdata, 'Laptop')
    await useLibrary().importFiles([
      new File(['x'], 'local.epub', { type: 'application/epub+zip' }),
    ])
    await useLibrary().saveProgress('local-x', at(0.5))
    await useSync().syncNow()
    expect(progressFiles(appdata)).toEqual([])
    expect([...appdata.files.values()].map((f) => [f.name, f.body])).toEqual([])
  })

  it('pushes with keepalive when the tab is hidden', async () => {
    const appdata = memoryAppData()
    await device(appdata, 'Laptop')
    await useLibrary().addFromDrive([driveFile('b1')])
    await useLibrary().saveProgress('b1', at(0.3))
    await useSync().push({ keepalive: true })
    expect(appdata.calls.filter((c) => c.op === 'create' && c.name === 'progress-b1.json')).toEqual(
      [{ op: 'create', name: 'progress-b1.json', keepalive: true }],
    )
  })
})

describe('two devices', () => {
  it('a book added and read on one device appears with its position on the other', async () => {
    const appdata = memoryAppData()
    const laptop = await device(appdata, 'Laptop')
    await useLibrary().addFromDrive([driveFile('b1')])
    await useLibrary().saveProgress('b1', at(0.42))
    await useSync().syncNow()

    const phone = await device(appdata, 'Phone')
    await useSync().syncNow()
    expect(useLibrary().books.map((b) => [b.id, b.source, b.downloaded])).toEqual([
      ['b1', 'drive', false],
    ])
    expect(useLibrary().progress.b1).toMatchObject({
      fraction: 0.42,
      dirty: false,
      device: { id: 'laptop', name: 'Laptop' },
    })

    // Reading on the phone flows back to the laptop.
    await useLibrary().saveProgress('b1', at(0.5))
    await useSync().syncNow()
    on(laptop)
    await useSync().syncNow()
    expect(useLibrary().progress.b1).toMatchObject({ fraction: 0.5, device: { name: 'Phone' } })
    void phone
  })

  it('a book removed on one device is removed on the other, not added back', async () => {
    const appdata = memoryAppData()
    const laptop = await device(appdata, 'Laptop')
    await useLibrary().addFromDrive([driveFile('b1'), driveFile('b2')])
    await useSync().syncNow()

    const phone = await device(appdata, 'Phone')
    await useSync().syncNow()
    expect(useLibrary().books).toHaveLength(2)

    on(laptop)
    await useLibrary().remove('b1')
    await useSync().syncNow()

    on(phone)
    await useSync().syncNow()
    expect(useLibrary().books.map((b) => b.id)).toEqual(['b2'])
    await useSync().syncNow()
    expect(useLibrary().books.map((b) => b.id)).toEqual(['b2'])
  })

  it('on a conflict the later position wins and the other is offered once', async () => {
    const appdata = memoryAppData()
    const laptop = await device(appdata, 'Laptop')
    await useLibrary().addFromDrive([driveFile('b1')])
    await useLibrary().saveProgress('b1', at(0.2))
    await useSync().syncNow()

    const phone = await device(appdata, 'Phone')
    await useSync().syncNow()

    // Both read offline; the phone's write is later.
    on(laptop)
    await useLibrary().saveProgress('b1', at(0.3))
    on(phone)
    phone.ctx.advance(3_600_000)
    await useLibrary().saveProgress('b1', at(0.61))
    await useSync().syncNow()

    on(laptop)
    await useSync().syncNow()
    expect(useLibrary().progress.b1).toMatchObject({ fraction: 0.61, dirty: false })
    expect(useSync().takeOffer('b1')).toMatchObject({ fraction: 0.3, device: { name: 'Laptop' } })
    expect(useSync().takeOffer('b1')).toBeUndefined()
  })

  it('a newer position for the open book is offered, not applied', async () => {
    const appdata = memoryAppData()
    const laptop = await device(appdata, 'Laptop')
    await useLibrary().addFromDrive([driveFile('b1')])
    await useLibrary().saveProgress('b1', at(0.2))
    await useSync().syncNow()

    await device(appdata, 'Phone')
    await useSync().syncNow()
    await useLibrary().saveProgress('b1', at(0.7))
    await useSync().syncNow()

    on(laptop)
    laptop.ctx.drive.download.mockResolvedValue(Ok(new Blob(['epub'])))
    await useReader().open('b1', document.createElement('div'))
    await useSync().syncNow()
    expect(useLibrary().progress.b1).toMatchObject({ fraction: 0.2 })
    expect(useSync().takeOffer('b1')).toMatchObject({ fraction: 0.7, device: { name: 'Phone' } })
  })
})

describe('failures', () => {
  it('an expired token keeps changes waiting and asks to reconnect', async () => {
    const appdata = memoryAppData()
    await device(appdata, 'Laptop')
    await useLibrary().addFromDrive([driveFile('b1')])
    await useLibrary().saveProgress('b1', at(0.3))
    appdata.fail = { kind: 'auth-expired' }
    await useSync().syncNow()
    expect(useSync().status).toBe('reconnect')
    expect(useAuth().status).toBe('expired')
    expect(useSync().pending).toBe(2) // the position and library.json
  })

  it('offline keeps changes waiting and recovers on the next sync', async () => {
    const appdata = memoryAppData()
    await device(appdata, 'Laptop')
    await useLibrary().addFromDrive([driveFile('b1')])
    await useLibrary().saveProgress('b1', at(0.3))
    appdata.fail = { kind: 'offline' }
    await useSync().syncNow()
    expect(useSync().status).toBe('offline')
    expect(useSync().pending).toBe(2)

    appdata.fail = null
    await useSync().syncNow()
    expect(useSync().status).toBe('idle')
    expect(useSync().pending).toBe(0)
    expect(useSync().lastSyncAt).not.toBeNull()
  })

  it('without a token it waits quietly until connected', async () => {
    const appdata = memoryAppData()
    setActivePinia(createPinia())
    await setupServices({ appdata })
    await useSync().load()
    await useLibrary().addFromDrive([driveFile('b1')])
    await useSync().syncNow()
    expect(useSync().status).toBe('reconnect')
    expect(appdata.calls).toEqual([])
  })
})

describe('measurements', () => {
  it('reports what each sync did', async () => {
    const appdata = memoryAppData()
    await device(appdata, 'Laptop')
    await useLibrary().addFromDrive([driveFile('b1')])
    await useLibrary().saveProgress('b1', at(0.3))
    const info = vi.spyOn(logger, 'info')
    await useSync().syncNow()
    const done = info.mock.calls.find((c) => c[0] === 'sync.completed')![1]
    expect(done).toMatchObject({ pushed: 2, adopted: 0, offered: 0, library_changes: 0 })
    vi.restoreAllMocks()
  })

  it('reports failures with the number of changes waiting', async () => {
    const appdata = memoryAppData()
    await device(appdata, 'Laptop')
    await useLibrary().addFromDrive([driveFile('b1')])
    appdata.fail = { kind: 'offline' }
    const warn = vi.spyOn(logger, 'warn')
    await useSync().syncNow()
    expect(warn).toHaveBeenCalledWith('sync.failed', { reason: 'offline', pending: 1 })
    vi.restoreAllMocks()
  })
})

describe('Drive file changes', () => {
  async function withDriveBooks(...ids: string[]) {
    const d = await device(memoryAppData(), 'Laptop')
    await useLibrary().addFromDrive(ids.map(driveFile))
    return d
  }

  it('marks a book Drive no longer lists, once a day, without failing the sync', async () => {
    const d = await withDriveBooks('a', 'b')
    d.ctx.drive.searchBooks.mockResolvedValue(Ok([driveFile('a')]))
    const info = vi.spyOn(logger, 'info')

    await useSync().syncNow()
    expect(d.ctx.drive.searchBooks).toHaveBeenCalledWith('tok', '')
    expect(useLibrary().books.find((b) => b.id === 'b')?.missingInDrive).toBe(true)
    expect(useLibrary().books.find((b) => b.id === 'a')?.missingInDrive).toBeUndefined()
    expect(info).toHaveBeenCalledWith(
      'drive.checked',
      expect.objectContaining({ books: 2, missing: 1, new_versions: 0, complete: true }),
    )
    expect(useSync().status).toBe('idle')

    await useSync().syncNow()
    expect(d.ctx.drive.searchBooks).toHaveBeenCalledTimes(1)
    d.ctx.advance(24 * 3_600_000)
    await useSync().syncNow()
    expect(d.ctx.drive.searchBooks).toHaveBeenCalledTimes(2)
  })

  it('offers a new version of a downloaded book', async () => {
    const d = await withDriveBooks('a')
    await d.ctx.blobs.put('books/a', new Blob(['old']))
    await useLibrary().setDownloaded('a', true)
    d.ctx.drive.searchBooks.mockResolvedValue(Ok([{ ...driveFile('a'), md5: 'md5-v2', size: 99 }]))
    await useSync().syncNow()
    expect(useLibrary().books[0]!.driveVersion).toEqual({ md5: 'md5-v2', size: 99 })
  })

  it('keeps the sync healthy when the check fails, and tries again on the next pass', async () => {
    const d = await withDriveBooks('a')
    d.ctx.drive.searchBooks.mockResolvedValue({ _tag: 'Err', error: { kind: 'rate-limited' } })
    await useSync().syncNow()
    expect(useSync().status).toBe('idle')
    await useSync().syncNow()
    expect(d.ctx.drive.searchBooks).toHaveBeenCalledTimes(2)
  })

  it('marks nothing missing when the listing may be cut short', async () => {
    const d = await withDriveBooks('a')
    d.ctx.drive.searchBooks.mockResolvedValue(
      Ok(Array.from({ length: 5000 }, (_, i) => driveFile(`other-${i}`))),
    )
    await useSync().syncNow()
    expect(useLibrary().books[0]!.missingInDrive).toBeUndefined()
  })
})
