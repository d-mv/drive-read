import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { logger } from '@/services/logger'
import { memoryLocalFiles } from '@/services/storage/localFiles'
import type { BookEngine, ReadAloudSource } from '@/services/engine/types'
import type { Speaker } from '@/services/speech/player'

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

  it('applies theme before mount to prevent double-rendering', async () => {
    const { engine } = await withBook()
    const reader = useReader()
    const order: string[] = []
    engine.setTheme.mockImplementation(() => {
      order.push('setTheme')
    })
    engine.mount.mockImplementation(async () => {
      order.push('mount')
    })

    reader.setTheme({ css: 'body { color: black; }', fonts: [], maxInlineSize: 620 })
    await reader.open('local-abc', document.createElement('div'))

    expect(order).toEqual(['setTheme', 'mount'])
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

  it('mount relocation with normalized CFI during mount does not mark progress dirty', async () => {
    const { engine } = await withBook()
    const pos = {
      v: 1 as const,
      device: { id: 'dev1', name: 'Laptop' },
      locator: { kind: 'cfi' as const, cfi: 'epubcfi(/6/4!/4/2/1:0.42)' },
      fraction: 0.42,
      chapterIndex: 0,
      chapterFraction: 0.5,
      fileId: 'local-abc',
      updatedAt: '2026-10-04T12:00:00Z',
      dirty: false,
      bookmarks: [] as [],
    }
    await useLibrary().applyRemoteProgress(pos)

    // Simulate real engine behavior: engine.mount emits relocate during mount with normalized CFI
    let relocateCb: ((r: any) => void) | undefined
    engine.onRelocate.mockImplementation((cb) => {
      relocateCb = cb
    })
    engine.mount.mockImplementation(async () => {
      relocateCb?.({
        position: {
          locator: { kind: 'cfi', cfi: 'epubcfi(/6/4[chap1]!/4/2/1:0.42)' },
          fraction: 0.42,
          chapterIndex: 0,
          chapterFraction: 0.5,
        },
        chapterMinutesLeft: 10,
      })
    })

    await useReader().open('local-abc', document.createElement('div'))
    expect(useLibrary().progress['local-abc']?.dirty).toBe(false)
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

describe('open, desktop: a file read in place', () => {
  async function withFileOnDisk() {
    const files = memoryLocalFiles()
    const ctx = await setupServices({ files })
    const file = epubFile('abc')
    files.pathOf.set(file, '/Users/me/Books/harbour_year.epub')
    await useLibrary().importFiles([file])
    return { ...ctx, files }
  }

  it('reads the book from its path', async () => {
    const { engine } = await withFileOnDisk()
    const reader = useReader()
    await reader.open('local-abc', document.createElement('div'))

    const opened = engine.open.mock.calls.at(-1)?.[0]
    expect(opened?.name).toBe('harbour_year.epub')
    expect(opened?.type).toBe('application/epub+zip')
    expect(await opened?.text()).toBe('abc')
    expect(reader.status).toEqual({ kind: 'ready' })
  })

  it('says the file moved when it is no longer at its path', async () => {
    const { files } = await withFileOnDisk()
    files.disk.delete('/Users/me/Books/harbour_year.epub')
    const reader = useReader()
    await reader.open('local-abc', document.createElement('div'))
    expect(reader.status).toEqual({ kind: 'error', error: 'file-moved' })
  })

  it('opens again once the file is located', async () => {
    const { files } = await withFileOnDisk()
    files.disk.delete('/Users/me/Books/harbour_year.epub')
    const reader = useReader()
    await reader.open('local-abc', document.createElement('div'))

    const moved = epubFile('abc', 'harbour_year.epub')
    files.pathOf.set(moved, '/Users/me/Archive/harbour_year.epub')
    expect(await useLibrary().relink('local-abc', moved)).toBe('relinked')
    await reader.open('local-abc', document.createElement('div'))
    expect(reader.status).toEqual({ kind: 'ready' })
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

describe('search', () => {
  it('delegates search and clearSearch to the underlying engine', async () => {
    const { engine } = await withBook()
    const reader = useReader()
    engine.search = vi.fn<NonNullable<BookEngine['search']>>(async function* (q: string) {
      yield {
        label: 'Chapter 1',
        subitems: [{ locator: { kind: 'cfi' as const, cfi: '/4/2' }, excerpt: `found ${q}` }],
      }
    })
    await reader.open('local-abc', document.createElement('div'))

    const results: any[] = []
    for await (const r of reader.search('query')) {
      results.push(r)
    }

    expect(engine.search).toHaveBeenCalledWith('query')
    expect(results).toEqual([
      {
        label: 'Chapter 1',
        subitems: [{ locator: { kind: 'cfi', cfi: '/4/2' }, excerpt: 'found query' }],
      },
    ])

    reader.clearSearch()
    expect(engine.clearSearch).toHaveBeenCalled()

    reader.close()
    expect(engine.clearSearch).toHaveBeenCalledTimes(2)
  })
})

describe('open, desktop: a Drive book read from disk', () => {
  async function driveBookOnDisk() {
    const files = memoryLocalFiles()
    const ctx = await setupServices({ files })
    ctx.gis.requestToken.mockResolvedValue(
      Ok({ accessToken: 'tok', expiresAt: Date.now() + 3_600_000 }),
    )
    await useAuth().connect()
    await useLibrary().addFromDrive([
      {
        id: 'drive-1',
        name: 'Harbour Year.epub',
        mimeType: 'application/epub+zip',
        size: 3,
        md5: 'md5-abc',
        modifiedTime: '',
      },
    ])
    const file = epubFile('abc')
    files.pathOf.set(file, '/Books/harbour_year.epub')
    files.md5Of.set('/Books/harbour_year.epub', 'md5-abc')
    await useLibrary().importFiles([file])
    return { ...ctx, files }
  }

  it('opens from disk without downloading', async () => {
    const { drive } = await driveBookOnDisk()
    const reader = useReader()
    await reader.open('drive-1', document.createElement('div'))
    expect(reader.status).toEqual({ kind: 'ready' })
    expect(drive.download).not.toHaveBeenCalled()
  })

  it('downloads from Drive when the file on disk is gone', async () => {
    const { drive, files } = await driveBookOnDisk()
    files.disk.delete('/Books/harbour_year.epub')
    const reader = useReader()
    await reader.open('drive-1', document.createElement('div'))
    expect(drive.download).toHaveBeenCalled()
  })
})

describe('open: the format is checked against the downloaded bytes', () => {
  it('a Drive book named .epub that is really FB2 opens as FB2 and is recorded so', async () => {
    const ctx = await setupServices()
    ctx.gis.requestToken.mockResolvedValue(
      Ok({ accessToken: 'tok', expiresAt: Date.now() + 3_600_000 }),
    )
    await useAuth().connect()
    await useLibrary().addFromDrive([
      {
        id: 'x',
        name: 'Пламя (epub).epub',
        mimeType: 'application/epub+zip',
        size: 3,
        md5: 'm',
        modifiedTime: '',
      },
    ])
    ctx.drive.download.mockResolvedValue(
      Ok(new Blob(['<?xml version="1.0"?><FictionBook></FictionBook>'])),
    )
    const createEngine = vi.spyOn(ctx.services, 'createEngine')
    const reader = useReader()
    await reader.open('x', document.createElement('div'))

    expect(createEngine).toHaveBeenLastCalledWith('fb2')
    expect(useLibrary().books[0]?.format).toBe('fb2')
    expect(reader.status).toEqual({ kind: 'ready' })
  })
})

describe('read aloud', () => {
  const SSML = `<speak xmlns="http://www.w3.org/2001/10/synthesis"><mark name="0"/>Hello</speak>`

  async function withSpeech(opts: { speaker?: boolean; readable?: boolean } = {}) {
    const said: string[] = []
    const speaker = {
      speak: vi.fn<Speaker['speak']>((r) => void said.push(r.text)),
      cancel: vi.fn<Speaker['cancel']>(),
      voices: vi.fn<Speaker['voices']>(() => ({ count: 1, matched: true })),
    }
    const ctx = await setupServices(opts.speaker === false ? {} : { speaker })
    await useLibrary().importFiles([epubFile('abc')])
    const source = {
      start: vi.fn<ReadAloudSource['start']>(async () => SSML),
      next: vi.fn<ReadAloudSource['next']>(async () => null),
      resume: vi.fn<ReadAloudSource['resume']>(async () => SSML),
      mark: vi.fn<ReadAloudSource['mark']>(),
      stop: vi.fn<ReadAloudSource['stop']>(),
      onSwipe: vi.fn<ReadAloudSource['onSwipe']>(),
    }
    if (opts.readable !== false)
      ctx.engine.readAloud = vi.fn<NonNullable<BookEngine['readAloud']>>(() => source)
    const reader = useReader()
    await reader.open('local-abc', document.createElement('div'))
    return { ...ctx, reader, said, source, speaker }
  }

  it('is offered only when the book and the browser can both do it', async () => {
    expect((await withSpeech()).reader.canReadAloud).toBe(true)
    setActivePinia(createPinia())
    expect((await withSpeech({ readable: false })).reader.canReadAloud).toBe(false)
    setActivePinia(createPinia())
    expect((await withSpeech({ speaker: false })).reader.canReadAloud).toBe(false)
  })

  it('plays, pauses, and stops when the book closes', async () => {
    const { reader, said, source } = await withSpeech()
    await reader.toggleReadAloud()
    expect(reader.readAloudState).toBe('playing')
    expect(said).toEqual(['Hello'])
    await reader.toggleReadAloud()
    expect(reader.readAloudState).toBe('paused')
    reader.close()
    expect(source.stop).toHaveBeenCalled()
    expect(reader.canReadAloud).toBe(false)
  })

  it('reads on from the new page after a page turn', async () => {
    const { reader, engine, source } = await withSpeech()
    await reader.toggleReadAloud()
    await reader.next()
    expect(engine.next).toHaveBeenCalled()
    expect(source.start).toHaveBeenCalledTimes(2)
    expect(reader.readAloudState).toBe('playing')

    // A swipe turns the page without the store: the engine reports it.
    source.onSwipe.mock.calls[0]![0]()
    await expect.poll(() => source.start.mock.calls.length).toBe(3)
  })

  it('steps the speed', async () => {
    const { reader, speaker } = await withSpeech()
    reader.stepReadAloudRate(1)
    await reader.toggleReadAloud()
    expect(reader.readAloudRate).toBe(1.25)
    expect(speaker.speak).toHaveBeenLastCalledWith(
      expect.objectContaining({ rate: 1.25 }),
      expect.anything(),
    )
  })
})
