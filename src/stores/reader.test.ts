import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { logger } from '@/services/logger'

import { useAuth } from './auth'
import { useLibrary } from './library'
import { useReader } from './reader'
import { epubFile, Err, META, Ok, setupServices } from './test-services'

beforeEach(() => setActivePinia(createPinia()))

const relocation = (fraction: number) => ({
  position: {
    locator: { kind: 'cfi' as const, cfi: `epubcfi(/6/4!/4/2/1:${fraction})` },
    fraction,
    chapterIndex: fraction < 0.5 ? 0 : 1,
    chapterFraction: 0.5,
  },
  chapterMinutesLeft: 11,
})

async function withBook() {
  const ctx = await setupServices()
  await useLibrary().importFiles([epubFile('abc')])
  return ctx
}

describe('open', () => {
  it('opens the stored file and mounts at the start of a new book', async () => {
    const { engine } = await withBook()
    const reader = useReader()
    const el = document.createElement('div')
    await reader.open('local-abc', el)

    expect(engine.open).toHaveBeenCalledWith(expect.any(File))
    expect(engine.mount).toHaveBeenCalledWith(el, undefined)
    expect(reader.status).toEqual({ kind: 'ready' })
    expect(reader.toc).toEqual(META.toc)
  })

  it('restores the saved position without marking it dirty', async () => {
    const { relocate } = await withBook()
    const pos = {
      v: 1 as const,
      device: { id: 'dev1', name: 'Laptop' },
      ...relocation(0.42).position,
      fileId: 'local-abc',
      updatedAt: '2026-10-04T12:00:00Z',
      dirty: false,
      bookmarks: [] as [],
    }
    await useLibrary().applyRemoteProgress(pos)
    expect(useLibrary().progress['local-abc']?.dirty).toBe(false)
    const originalTime = useLibrary().progress['local-abc']?.updatedAt

    await useReader().open('local-abc', document.createElement('div'))
    // Mount report with restored position
    relocate(relocation(0.42))
    expect(useLibrary().progress['local-abc']?.dirty).toBe(false)
    expect(useLibrary().progress['local-abc']?.updatedAt).toBe(originalTime)
  })

  it('marks the book opened', async () => {
    await withBook()
    await useReader().open('local-abc', document.createElement('div'))
    expect(useLibrary().books[0]!.openedAt).not.toBeNull()
  })

  it('reports a book that is not in the library', async () => {
    await setupServices()
    const reader = useReader()
    await reader.open('nope', document.createElement('div'))
    expect(reader.status).toEqual({ kind: 'error', error: 'not-found' })
  })

  it('reports a file the browser evicted', async () => {
    const { blobs } = await withBook()
    await blobs.remove('books/local-abc')
    const reader = useReader()
    await reader.open('local-abc', document.createElement('div'))
    expect(reader.status).toEqual({ kind: 'error', error: 'missing-file' })
  })
})

describe('reading', () => {
  it('tracks the position and saves it on page turns, but ignores duplicate layout reports', async () => {
    const { relocate } = await withBook()
    const pos = {
      v: 1 as const,
      device: { id: 'dev1', name: 'Laptop' },
      ...relocation(0.3).position,
      fileId: 'local-abc',
      updatedAt: '2026-10-04T12:00:00Z',
      dirty: false,
      bookmarks: [] as [],
    }
    await useLibrary().applyRemoteProgress(pos)

    const reader = useReader()
    await reader.open('local-abc', document.createElement('div'))
    relocate(relocation(0.3)) // mount / restored position
    relocate(relocation(0.3)) // window resize / layout report: no page turn
    expect(useLibrary().progress['local-abc']?.dirty).toBe(false)

    relocate(relocation(0.6)) // actual page turn
    await Promise.resolve()

    expect(reader.position?.fraction).toBe(0.6)
    expect(reader.chapterMinutesLeft).toBe(11)
    await expect.poll(() => useLibrary().items[0]!.fraction).toBe(0.6)
    expect(useLibrary().progress['local-abc']?.dirty).toBe(true)
  })

  it('turns pages and follows contents links through the engine', async () => {
    const { engine } = await withBook()
    const reader = useReader()
    await reader.open('local-abc', document.createElement('div'))
    await reader.next()
    await reader.prev()
    await reader.goTo(META.toc[1]!.locator)
    expect(engine.next).toHaveBeenCalled()
    expect(engine.prev).toHaveBeenCalled()
    expect(engine.goTo).toHaveBeenCalledWith({ kind: 'href', href: 'ch2.xhtml' })
  })

  it('destroys the engine on close', async () => {
    const { engine } = await withBook()
    const reader = useReader()
    await reader.open('local-abc', document.createElement('div'))
    reader.close()
    expect(engine.destroy).toHaveBeenCalled()
    expect(reader.status).toEqual({ kind: 'idle' })
  })
})

describe('Drive books', () => {
  const driveFile = {
    id: 'd1',
    name: 'A.epub',
    mimeType: 'application/epub+zip',
    size: 3,
    md5: 'm',
    modifiedTime: '',
  }

  async function withDriveBook(token: string | null) {
    const ctx = await setupServices()
    if (token)
      ctx.gis.requestToken.mockResolvedValue(
        Ok({ accessToken: token, expiresAt: Date.now() + 3_600_000 }),
      )
    if (token) await useAuth().connect()
    await useLibrary().addFromDrive([driveFile])
    return ctx
  }

  it('downloads on first open, then reads the real metadata', async () => {
    const { drive, blobs, engine } = await withDriveBook('tok')
    drive.download.mockImplementation(async (_t, _f, onProgress) => {
      onProgress?.(0.5)
      return Ok(new Blob(['abc'], { type: 'application/epub+zip' }))
    })
    const reader = useReader()
    await reader.open('d1', document.createElement('div'))

    expect(drive.download).toHaveBeenCalledWith(
      'tok',
      expect.objectContaining({ id: 'd1' }),
      expect.any(Function),
    )
    expect(blobs.paths()).toContain('books/d1')
    expect(engine.open).toHaveBeenCalled()
    expect(reader.status).toEqual({ kind: 'ready' })
    expect(useLibrary().books[0]).toMatchObject({
      downloaded: true,
      title: 'Harbour Year',
      provisional: false,
    })
  })

  it('asks to reconnect when there is no token', async () => {
    const { drive } = await withDriveBook(null)
    const reader = useReader()
    await reader.open('d1', document.createElement('div'))
    expect(reader.status).toEqual({ kind: 'error', error: 'reconnect' })
    expect(drive.download).not.toHaveBeenCalled()
  })

  it.each([
    [{ kind: 'auth-expired' as const }, 'reconnect'],
    [{ kind: 'offline' as const }, 'offline'],
    [{ kind: 'not-found' as const }, 'missing-in-drive'],
    [{ kind: 'forbidden' as const }, 'missing-in-drive'],
    [{ kind: 'http' as const, status: 500 }, 'download-failed'],
  ])('a download error %o shows %s', async (error, shown) => {
    const { drive } = await withDriveBook('tok')
    drive.download.mockResolvedValue(Err(error))
    const reader = useReader()
    await reader.open('d1', document.createElement('div'))
    expect(reader.status).toEqual({ kind: 'error', error: shown })
    expect(useLibrary().books[0]!.downloaded).toBe(false)
  })

  it('an expired token on download marks auth expired', async () => {
    const { drive } = await withDriveBook('tok')
    drive.download.mockResolvedValue(Err({ kind: 'auth-expired' }))
    await useReader().open('d1', document.createElement('div'))
    expect(useAuth().status).toBe('expired')
  })

  it('downloads again when the browser evicted the file', async () => {
    const { drive, blobs } = await withDriveBook('tok')
    drive.download.mockResolvedValue(Ok(new Blob(['abc'])))
    await useReader().open('d1', document.createElement('div'))
    await blobs.remove('books/d1')
    useReader().close()
    await useReader().open('d1', document.createElement('div'))
    expect(drive.download).toHaveBeenCalledTimes(2)
    expect(useReader().status).toEqual({ kind: 'ready' })
  })
})

describe('measurements', () => {
  it('reports how long a book took to open, and the reading session when it closes', async () => {
    const info = vi.spyOn(logger, 'info')
    const { relocate } = await withBook()
    const reader = useReader()
    await reader.open('local-abc', document.createElement('div'))
    relocate(relocation(0.3))
    relocate(relocation(0.6))
    reader.close()
    const events = Object.fromEntries(info.mock.calls.map((c) => [c[0], c[1]]))
    expect(events['book.opened']).toMatchObject({
      format: 'epub',
      source: 'local',
      downloaded_now: false,
    })
    expect(events['book.opened']!.ms).toEqual(expect.any(Number))
    // The first report is the restored start, not a page turn.
    expect(events['reading.session']).toMatchObject({
      format: 'epub',
      source: 'local',
      pages: 1,
      from: 0.3,
      to: 0.6,
    })
    vi.restoreAllMocks()
  })

  it('reports why a book failed to open', async () => {
    const warn = vi.spyOn(logger, 'warn')
    await setupServices()
    await useReader().open('nope', document.createElement('div'))
    expect(warn).toHaveBeenCalledWith(
      'book.open_failed',
      expect.objectContaining({ reason: 'not-found' }),
    )
    vi.restoreAllMocks()
  })
})

describe('reading.session pages', () => {
  it('counts a page only when the position changes, not on layout reports', async () => {
    const info = vi.spyOn(logger, 'info')
    const { relocate } = await withBook()
    const reader = useReader()
    await reader.open('local-abc', document.createElement('div'))
    relocate(relocation(0.3)) // restored start
    relocate(relocation(0.3)) // address bar slid: same position
    relocate(relocation(0.3)) // rotation: same position
    relocate(relocation(0.4)) // a real page turn
    reader.close()
    const session = info.mock.calls.find((c) => c[0] === 'reading.session')![1]
    expect(session).toMatchObject({ pages: 1, from: 0.3, to: 0.4 })
    vi.restoreAllMocks()
  })
})

describe('reading.session minutes', () => {
  it('counts idle gaps (no page turn) as at most 5 minutes', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-05T10:00:00Z'))
    const info = vi.spyOn(logger, 'info')
    const { relocate } = await withBook()
    const reader = useReader()
    await reader.open('local-abc', document.createElement('div'))
    relocate(relocation(0.3))
    vi.setSystemTime(new Date('2026-10-05T10:02:00Z')) // read 2 min
    relocate(relocation(0.4))
    vi.setSystemTime(new Date('2026-10-05T11:30:00Z')) // phone left on the table
    relocate(relocation(0.5))
    vi.setSystemTime(new Date('2026-10-05T11:31:00Z'))
    reader.close()
    const session = info.mock.calls.find((c) => c[0] === 'reading.session')![1]
    // 2 + min(88, 5) + 1 = 8 minutes, not 91.
    expect(session).toMatchObject({ minutes: 8, pages: 2 })
    vi.restoreAllMocks()
    vi.useRealTimers()
  })
})

describe('zoom (PDF)', () => {
  /** A zoomable engine, as the PDF one is; `pinch` reports a zoom made by gesture. */
  async function withZoomableBook() {
    const ctx = await withBook()
    let zoomCb: ((z: number) => void) | undefined
    ctx.engine.setZoom = vi.fn<(z: number) => Promise<void>>(async () => {})
    ctx.engine.onZoom = vi.fn<(cb: (z: number) => void) => void>((cb) => {
      zoomCb = cb
    })
    await useReader().open('local-abc', document.createElement('div'))
    return { ...ctx, pinch: (z: number) => zoomCb?.(z) }
  }

  it('is not offered by engines that cannot zoom', async () => {
    await withBook()
    const reader = useReader()
    await reader.open('local-abc', document.createElement('div'))
    expect(reader.zoomable).toBe(false)
    await reader.zoomBy(1)
    expect(reader.zoom).toBe(1)
  })

  it('steps through the levels and back to fit', async () => {
    const { engine } = await withZoomableBook()
    const reader = useReader()
    expect(reader.zoomable).toBe(true)
    await reader.zoomBy(1)
    expect(engine.setZoom).toHaveBeenLastCalledWith(1.25)
    expect(reader.zoom).toBe(1.25)
    await reader.zoomBy(1)
    expect(reader.zoom).toBe(1.5)
    await reader.zoomBy(0)
    expect(engine.setZoom).toHaveBeenLastCalledWith(1)
    expect(reader.zoom).toBe(1)
  })

  it('follows a pinch, and starts every book at fit', async () => {
    const { pinch } = await withZoomableBook()
    const reader = useReader()
    pinch(1.8)
    expect(reader.zoom).toBe(1.8)
    await reader.zoomBy(1)
    expect(reader.zoom).toBe(2)
    reader.close()
    expect(reader.zoom).toBe(1)
  })
})
