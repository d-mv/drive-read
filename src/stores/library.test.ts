import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import type { Position } from '@/services/engine/types'
import { isSome } from '@/shared/result'

import { useLibrary } from './library'
import { epubFile, Err, META, setupServices } from './test-services'

beforeEach(() => setActivePinia(createPinia()))

const at = (fraction: number): Position => ({
  locator: { kind: 'cfi', cfi: `epubcfi(/6/4!/4/2/1:${Math.round(fraction * 100)})` },
  fraction,
  chapterIndex: 0,
  chapterFraction: fraction,
})

describe('importFiles', () => {
  it('stores the file and cover and records the metadata', async () => {
    const { blobs, services } = await setupServices()
    const library = useLibrary()
    const result = await library.importFiles([epubFile('abc')])

    expect(result.failed).toEqual([])
    expect(result.added).toEqual([
      expect.objectContaining({
        id: 'local-abc',
        source: 'local',
        format: 'epub',
        fileName: 'harbour_year.epub',
        title: 'Harbour Year',
        author: 'Ines Calder',
        toc: META.toc,
        hasCover: true,
        downloaded: true,
        openedAt: null,
      }),
    ])
    expect(blobs.paths()).toEqual(['books/local-abc', 'covers/local-abc'])
    expect(isSome(await services.db.getBook('local-abc'))).toBe(true)
    expect(library.books).toHaveLength(1)
  })

  it('keeps one entry when the same bytes are added twice', async () => {
    await setupServices()
    const library = useLibrary()
    await library.importFiles([epubFile('abc')])
    const again = await library.importFiles([epubFile('abc', 'renamed.epub')])
    expect(again.added.map((b) => b.id)).toEqual(['local-abc'])
    expect(library.books).toHaveLength(1)
  })

  it('rejects formats other than EPUB for now', async () => {
    await setupServices()
    const library = useLibrary()
    const result = await library.importFiles([
      new File(['%PDF'], 'paper.pdf', { type: 'application/pdf' }),
      new File(['x'], 'notes.txt', { type: 'text/plain' }),
    ])
    expect(result.added).toEqual([])
    expect(result.failed).toEqual([
      { name: 'paper.pdf', reason: 'unsupported' },
      { name: 'notes.txt', reason: 'unsupported' },
    ])
  })

  it('accepts an EPUB by extension when the browser gives no type', async () => {
    await setupServices()
    const result = await useLibrary().importFiles([new File(['abc'], 'book.epub')])
    expect(result.added).toHaveLength(1)
  })

  it('stores nothing for a file the engine cannot open', async () => {
    const { blobs } = await setupServices({ meta: Err({ kind: 'unreadable', message: 'DRM' }) })
    const library = useLibrary()
    const result = await library.importFiles([epubFile('abc')])
    expect(result.failed).toEqual([{ name: 'harbour_year.epub', reason: 'unreadable' }])
    expect(blobs.paths()).toEqual([])
    expect(library.books).toEqual([])
  })
})

describe('progress and the library view', () => {
  it('saves a dirty progress record with the device and time', async () => {
    const { services } = await setupServices()
    const library = useLibrary()
    await library.importFiles([epubFile('abc')])
    await library.saveProgress('local-abc', at(0.42))

    const saved = await services.db.getProgress('local-abc')
    expect(saved).toEqual({
      _tag: 'Some',
      value: expect.objectContaining({
        v: 1,
        fileId: 'local-abc',
        fraction: 0.42,
        dirty: true,
        device: { id: 'dev1', name: 'Laptop' },
        locator: at(0.42).locator,
      }),
    })
    expect(library.items[0]!.fraction).toBe(0.42)
  })

  it('offers the most recently opened unfinished book to continue', async () => {
    await setupServices()
    const library = useLibrary()
    await library.importFiles([epubFile('a'), epubFile('b'), epubFile('c')])
    await library.markOpened('local-a')
    await library.saveProgress('local-a', at(0.3))
    await library.markOpened('local-b')
    await library.saveProgress('local-b', at(1))
    expect(library.continueBook?.id).toBe('local-a')
  })

  it('has nothing to continue when nothing is in progress', async () => {
    await setupServices()
    const library = useLibrary()
    await library.importFiles([epubFile('a')])
    expect(library.continueBook).toBeUndefined()
  })

  it('reloads books and progress from storage', async () => {
    await setupServices()
    await useLibrary().importFiles([epubFile('a')])
    await useLibrary().saveProgress('local-a', at(0.5))

    setActivePinia(createPinia())
    const fresh = useLibrary()
    await fresh.load()
    expect(fresh.items.map((i) => [i.id, i.fraction])).toEqual([['local-a', 0.5]])
  })
})

describe('remove', () => {
  it('deletes the file, cover, record and progress', async () => {
    const { blobs, services } = await setupServices()
    const library = useLibrary()
    await library.importFiles([epubFile('abc')])
    await library.saveProgress('local-abc', at(0.2))
    await library.remove('local-abc')

    expect(blobs.paths()).toEqual([])
    expect(library.books).toEqual([])
    expect(isSome(await services.db.getProgress('local-abc'))).toBe(false)
  })
})

describe('addFromDrive', () => {
  const driveFile = (id: string, name: string, mimeType = 'application/epub+zip') => ({
    id,
    name,
    mimeType,
    size: 1234,
    md5: `md5-${id}`,
    modifiedTime: '2026-10-01T00:00:00Z',
  })

  it('registers Drive books without downloading them, titled from the file name', async () => {
    const { blobs, engine } = await setupServices()
    const library = useLibrary()
    const result = await library.addFromDrive([driveFile('d1', 'Dawson, Mark. The Cleaner.epub')])

    expect(result.failed).toEqual([])
    expect(result.added).toEqual([
      expect.objectContaining({
        id: 'd1',
        source: 'drive',
        format: 'epub',
        title: 'The Cleaner',
        author: 'Mark Dawson',
        md5: 'md5-d1',
        size: 1234,
        downloaded: false,
        provisional: true,
      }),
    ])
    expect(blobs.paths()).toEqual([])
    expect(engine.open).not.toHaveBeenCalled()
  })

  it('skips books already in the library and refuses PDFs for now', async () => {
    await setupServices()
    const library = useLibrary()
    await library.addFromDrive([driveFile('d1', 'A.epub')])
    const again = await library.addFromDrive([
      driveFile('d1', 'A.epub'),
      driveFile('p1', 'Paper.pdf', 'application/pdf'),
    ])
    expect(again.added.map((b) => b.id)).toEqual(['d1'])
    expect(again.failed).toEqual([{ name: 'Paper.pdf', reason: 'unsupported' }])
    expect(library.books).toHaveLength(1)
  })

  it('applies the real metadata once the book is opened', async () => {
    const { blobs } = await setupServices()
    const library = useLibrary()
    await library.addFromDrive([driveFile('d1', 'A.epub')])
    await library.applyMeta('d1', META)
    expect(library.books[0]).toMatchObject({
      title: 'Harbour Year',
      author: 'Ines Calder',
      toc: META.toc,
      hasCover: true,
      provisional: false,
    })
    expect(blobs.paths()).toEqual(['covers/d1'])
  })
})
