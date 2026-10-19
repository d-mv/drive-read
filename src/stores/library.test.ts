import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Position } from '@/services/engine/types'
import { logger } from '@/services/logger'
import { type MemoryLocalFiles, memoryLocalFiles } from '@/services/storage/localFiles'
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

  it('accepts PDF as well as EPUB, and rejects other formats', async () => {
    await setupServices()
    const library = useLibrary()
    const result = await library.importFiles([
      new File(['%PDF'], 'paper.pdf', { type: 'application/pdf' }),
      new File(['%PDF2'], 'scan.PDF'),
      new File(['x'], 'notes.txt', { type: 'text/plain' }),
    ])
    expect(result.added.map((b) => [b.id, b.format])).toEqual([
      ['local-%PDF', 'pdf'],
      ['local-%PDF2', 'pdf'],
    ])
    expect(result.failed).toEqual([{ name: 'notes.txt', reason: 'unsupported' }])
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

  it('continues the book read most recently on any device, opened here or not', async () => {
    await setupServices()
    const library = useLibrary()
    await library.importFiles([epubFile('a'), epubFile('b')])
    await library.markOpened('local-a')
    await library.saveProgress('local-a', at(0.3))
    // A position synced from another device; this device never opened the book.
    await library.applyRemoteProgress({
      v: 1,
      fileId: 'local-b',
      locator: at(0.5).locator,
      fraction: 0.5,
      updatedAt: '2030-01-01T00:00:00Z',
      device: { id: 'phone', name: 'Phone' },
      dirty: false,
      bookmarks: [],
    })
    expect(library.continueBook?.id).toBe('local-b')
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

  it('skips books already in the library and registers PDFs as PDF', async () => {
    await setupServices()
    const library = useLibrary()
    await library.addFromDrive([driveFile('d1', 'A.epub')])
    const again = await library.addFromDrive([
      driveFile('d1', 'A.epub'),
      driveFile('p1', 'Paper.pdf', 'application/pdf'),
      driveFile('x1', 'Notes.txt', 'text/plain'),
    ])
    expect(again.added.map((b) => [b.id, b.format])).toEqual([
      ['d1', 'epub'],
      ['p1', 'pdf'],
    ])
    expect(again.failed).toEqual([{ name: 'Notes.txt', reason: 'unsupported' }])
    expect(library.books).toHaveLength(2)
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

describe('persistence of updated records', () => {
  it('saves real metadata and the downloaded flag to storage, not only in memory', async () => {
    await setupServices()
    const library = useLibrary()
    await library.addFromDrive([
      {
        id: 'd1',
        name: 'A.epub',
        mimeType: 'application/epub+zip',
        size: 1,
        md5: null,
        modifiedTime: '',
      },
    ])
    await library.applyMeta('d1', META)
    await library.setDownloaded('d1', true)
    await library.markOpened('d1')

    setActivePinia(createPinia())
    const reloaded = useLibrary()
    await reloaded.load()
    expect(reloaded.books[0]).toMatchObject({
      title: 'Harbour Year',
      toc: META.toc,
      downloaded: true,
      provisional: false,
      openedAt: expect.any(String),
    })
  })
})

describe('removeDownload', () => {
  const driveBook = {
    id: 'd1',
    name: 'A.epub',
    mimeType: 'application/epub+zip',
    size: 4321,
    md5: null,
    modifiedTime: '',
  }

  it('frees the file of a Drive book but keeps the book, cover and position', async () => {
    const { blobs, services } = await setupServices()
    const library = useLibrary()
    await library.addFromDrive([driveBook])
    await blobs.put('books/d1', new Blob(['book']))
    await blobs.put('covers/d1', new Blob(['cover']))
    await library.setDownloaded('d1', true)
    await library.saveProgress('d1', at(0.4))
    const info = vi.spyOn(logger, 'info')

    expect(await library.removeDownload('d1')).toBe(true)

    expect(blobs.paths()).toEqual(['covers/d1'])
    expect(library.books[0]).toMatchObject({ id: 'd1', downloaded: false })
    expect(library.items[0]!.downloadBytes).toBeNull()
    expect(library.progress.d1?.fraction).toBe(0.4)
    expect(isSome(await services.db.getProgress('d1'))).toBe(true)
    expect(info).toHaveBeenCalledWith('library.download_removed', { format: 'epub', bytes: 4321 })
  })

  it('refuses a book from this device: its file is the only copy', async () => {
    const { blobs } = await setupServices()
    const library = useLibrary()
    await library.importFiles([epubFile('abc')])
    expect(await library.removeDownload('local-abc')).toBe(false)
    expect(blobs.paths()).toContain('books/local-abc')
    expect(library.books[0]!.downloaded).toBe(true)
  })

  it('shows downloaded Drive books with their size in the library items', async () => {
    const { blobs } = await setupServices()
    const library = useLibrary()
    await library.addFromDrive([driveBook])
    await library.importFiles([epubFile('abc')])
    expect(library.items.map((i) => [i.id, i.downloadBytes])).toEqual(
      expect.arrayContaining([
        ['d1', null],
        ['local-abc', null],
      ]),
    )
    await blobs.put('books/d1', new Blob(['book']))
    await library.setDownloaded('d1', true)
    expect(library.items.find((i) => i.id === 'd1')!.downloadBytes).toBe(4321)
  })
})

describe('Drive file changes', () => {
  const driveBook = {
    id: 'd1',
    name: 'A.epub',
    mimeType: 'application/epub+zip',
    size: 100,
    md5: 'v1',
    modifiedTime: '',
  }

  it('applies and stores the changes found in Drive', async () => {
    const { services } = await setupServices()
    const library = useLibrary()
    await library.addFromDrive([driveBook])
    await library.applyDriveChanges([{ id: 'd1', patch: { missingInDrive: true } }])
    expect(library.books[0]!.missingInDrive).toBe(true)
    const stored = await services.db.getBook('d1')
    expect(isSome(stored) && stored.value.missingInDrive).toBe(true)
  })

  it('takes a new version: the old file goes, the next open downloads the new one', async () => {
    const { blobs } = await setupServices()
    const library = useLibrary()
    await library.addFromDrive([driveBook])
    await blobs.put('books/d1', new Blob(['old']))
    await library.setDownloaded('d1', true)
    await library.saveProgress('d1', at(0.5))
    await library.applyDriveChanges([
      { id: 'd1', patch: { driveVersion: { md5: 'v2', size: 200 } } },
    ])

    await library.acceptNewVersion('d1')

    expect(blobs.paths()).toEqual([])
    expect(library.books[0]).toMatchObject({ downloaded: false, md5: 'v2', size: 200 })
    expect(library.books[0]!.driveVersion).toBeUndefined()
    expect(library.progress.d1?.fraction).toBe(0.5)
  })

  it('a removed download drops any pending version offer', async () => {
    const { blobs } = await setupServices()
    const library = useLibrary()
    await library.addFromDrive([driveBook])
    await blobs.put('books/d1', new Blob(['old']))
    await library.setDownloaded('d1', true)
    await library.applyDriveChanges([
      { id: 'd1', patch: { driveVersion: { md5: 'v2', size: 200 } } },
    ])
    await library.removeDownload('d1')
    expect(library.books[0]!.driveVersion).toBeUndefined()
  })
})

describe('verifyDownloads', () => {
  it('returns books whose file the browser evicted to "Drive only"', async () => {
    const { blobs } = await setupServices()
    const library = useLibrary()
    await library.addFromDrive([
      {
        id: 'd1',
        name: 'A.epub',
        mimeType: 'application/epub+zip',
        size: 1,
        md5: null,
        modifiedTime: '',
      },
      {
        id: 'd2',
        name: 'B.epub',
        mimeType: 'application/epub+zip',
        size: 1,
        md5: null,
        modifiedTime: '',
      },
    ])
    await blobs.put('books/d2', new Blob(['b']))
    await library.setDownloaded('d1', true) // file never stored: evicted
    await library.setDownloaded('d2', true)
    expect(await library.verifyDownloads()).toBe(1)
    expect(library.books.map((b) => [b.id, b.downloaded])).toEqual([
      ['d1', false],
      ['d2', true],
    ])
  })
})

describe('desktop: files read in place', () => {
  const onDisk = (files: MemoryLocalFiles, file: File, path: string) => {
    files.pathOf.set(file, path)
    return file
  }

  it('records the path and copies nothing into app storage', async () => {
    const files = memoryLocalFiles()
    const { blobs } = await setupServices({ files })
    const library = useLibrary()
    const file = onDisk(files, epubFile('abc'), '/Users/me/Books/harbour_year.epub')

    const result = await library.importFiles([file])

    expect(result.added).toEqual([
      expect.objectContaining({ id: 'local-abc', path: '/Users/me/Books/harbour_year.epub' }),
    ])
    expect(blobs.paths()).toEqual(['covers/local-abc'])
  })

  it('copies a file that is not on disk, as the web app does', async () => {
    const files = memoryLocalFiles()
    const { blobs } = await setupServices({ files })
    const result = await useLibrary().importFiles([epubFile('abc')])
    expect(result.added[0]?.path).toBeUndefined()
    expect(blobs.paths()).toEqual(['books/local-abc', 'covers/local-abc'])
  })

  it('follows the file when the same bytes are opened from a new place', async () => {
    const files = memoryLocalFiles()
    const { services } = await setupServices({ files })
    const library = useLibrary()
    await library.importFiles([onDisk(files, epubFile('abc'), '/old/a.epub')])
    await library.importFiles([onDisk(files, epubFile('abc'), '/new/a.epub')])

    expect(library.books.map((b) => b.path)).toEqual(['/new/a.epub'])
    const stored = await services.db.getBook('local-abc')
    expect(isSome(stored) && stored.value.path).toBe('/new/a.epub')
  })

  describe('relink', () => {
    it('points the book at the chosen file when the bytes match', async () => {
      const files = memoryLocalFiles()
      await setupServices({ files })
      const library = useLibrary()
      await library.importFiles([onDisk(files, epubFile('abc'), '/old/a.epub')])

      const r = await library.relink('local-abc', onDisk(files, epubFile('abc'), '/moved/a.epub'))

      expect(r).toBe('relinked')
      expect(library.books[0]?.path).toBe('/moved/a.epub')
    })

    it('refuses a different file and leaves the book alone', async () => {
      const files = memoryLocalFiles()
      await setupServices({ files })
      const library = useLibrary()
      await library.importFiles([onDisk(files, epubFile('abc'), '/old/a.epub')])

      const r = await library.relink('local-abc', onDisk(files, epubFile('xyz'), '/other.epub'))

      expect(r).toBe('different-file')
      expect(library.books.map((b) => b.path)).toEqual(['/old/a.epub'])
      expect(library.books).toHaveLength(1)
    })
  })
})

describe('desktop: a local file that is a Drive book', () => {
  const drive = {
    id: 'drive-1',
    name: 'Harbour Year.epub',
    mimeType: 'application/epub+zip',
    size: 3,
    md5: 'md5-abc',
    modifiedTime: '',
  }

  it('becomes that Drive book, read from disk, when the MD5 matches', async () => {
    const files = memoryLocalFiles()
    await setupServices({ files })
    const library = useLibrary()
    await library.addFromDrive([drive])
    const file = epubFile('abc')
    files.pathOf.set(file, '/Books/harbour_year.epub')
    files.md5Of.set('/Books/harbour_year.epub', 'md5-abc')

    const result = await library.importFiles([file])

    expect(result.added.map((b) => b.id)).toEqual(['drive-1'])
    expect(library.books).toEqual([
      expect.objectContaining({ id: 'drive-1', source: 'drive', path: '/Books/harbour_year.epub' }),
    ])
  })

  it('stays a local book when no Drive book has its MD5', async () => {
    const files = memoryLocalFiles()
    await setupServices({ files })
    const library = useLibrary()
    await library.addFromDrive([drive])
    const file = epubFile('abc')
    files.pathOf.set(file, '/Books/other.epub')
    files.md5Of.set('/Books/other.epub', 'md5-zzz')

    await library.importFiles([file])

    expect(library.books.map((b) => b.id).sort()).toEqual(['drive-1', 'local-abc'])
  })
})

describe('FB2', () => {
  it('imports an FB2 by its contents, even when it is named .epub', async () => {
    const { services } = await setupServices()
    const createEngine = vi.spyOn(services, 'createEngine')
    const fb2 = new File(['<?xml version="1.0"?><FictionBook></FictionBook>'], 'Пламя (epub).epub')

    const result = await useLibrary().importFiles([fb2])

    expect(result.failed).toEqual([])
    expect(result.added[0]?.format).toBe('fb2')
    expect(createEngine).toHaveBeenCalledWith('fb2')
  })
})
