import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import type { BookRecord } from '@/domain/book'
import type { DriveFile } from '@/services/drive/client'

import { applyPatches, compareWithDrive } from './driveCheck'

const book = (id: string, over: Partial<BookRecord> = {}): BookRecord => ({
  v: 1,
  id,
  source: 'drive',
  format: 'epub',
  fileName: `${id}.epub`,
  title: id,
  author: '',
  size: 100,
  toc: [],
  hasCover: false,
  downloaded: true,
  addedAt: '2026-10-01T00:00:00Z',
  openedAt: null,
  md5: `md5-${id}`,
  ...over,
})

const file = (id: string, md5: string | null = `md5-${id}`, size = 100): DriveFile => ({
  id,
  name: `${id}.epub`,
  mimeType: 'application/epub+zip',
  size,
  md5,
  modifiedTime: '2026-10-01T00:00:00Z',
})

describe('compareWithDrive', () => {
  it('changes nothing when every book is in Drive unchanged', () => {
    expect(compareWithDrive([book('a'), book('b')], [file('a'), file('b')], true)).toEqual([])
  })

  it('marks a book missing from a complete listing, and clears it once it is back', () => {
    expect(compareWithDrive([book('a')], [], true)).toEqual([
      { id: 'a', patch: { missingInDrive: true } },
    ])
    expect(compareWithDrive([book('a', { missingInDrive: true })], [file('a')], true)).toEqual([
      { id: 'a', patch: { missingInDrive: false } },
    ])
  })

  it('never marks a book missing from an incomplete listing', () => {
    expect(compareWithDrive([book('a')], [], false)).toEqual([])
  })

  it('offers a new version of a downloaded book whose file changed in Drive', () => {
    expect(compareWithDrive([book('a')], [file('a', 'md5-new', 250)], true)).toEqual([
      { id: 'a', patch: { driveVersion: { md5: 'md5-new', size: 250 } } },
    ])
  })

  it('just records the new md5 of a book not downloaded yet: its download gets the new file', () => {
    expect(
      compareWithDrive([book('a', { downloaded: false })], [file('a', 'md5-new', 250)], true),
    ).toEqual([{ id: 'a', patch: { md5: 'md5-new', size: 250 } }])
  })

  it('withdraws the offer when Drive is back to the downloaded file', () => {
    const offered = book('a', { driveVersion: { md5: 'md5-new', size: 250 } })
    expect(compareWithDrive([offered], [file('a')], true)).toEqual([
      { id: 'a', patch: { driveVersion: undefined } },
    ])
  })

  it('ignores books from this device, and files without an md5', () => {
    expect(compareWithDrive([book('local-x', { source: 'local' })], [], true)).toEqual([])
    expect(compareWithDrive([book('a')], [file('a', null)], true)).toEqual([])
  })
})

describe('compareWithDrive properties', () => {
  const ids = ['a', 'b', 'c', 'd', 'e']
  const md5s = fc.constantFrom('m1', 'm2', 'm3')
  const library = fc.uniqueArray(
    fc.record({
      id: fc.constantFrom(...ids),
      downloaded: fc.boolean(),
      md5: md5s,
      missingInDrive: fc.boolean(),
      offered: fc.option(md5s, { nil: undefined }),
      source: fc.constantFrom('drive' as const, 'local' as const),
    }),
    { selector: (b) => b.id },
  )
  const drive = fc.uniqueArray(fc.record({ id: fc.constantFrom(...ids), md5: md5s }), {
    selector: (f) => f.id,
  })
  type Gen = {
    id: string
    downloaded: boolean
    md5: string
    missingInDrive: boolean
    offered?: string
    source: 'drive' | 'local'
  }
  const toBooks = (bs: Gen[]) =>
    bs.map((b) =>
      book(b.id, {
        downloaded: b.downloaded,
        md5: b.md5,
        missingInDrive: b.missingInDrive,
        source: b.source,
        driveVersion: b.offered === undefined ? undefined : { md5: b.offered, size: 100 },
      }),
    )
  const toFiles = (fs: { id: string; md5: string }[]) => fs.map((f) => file(f.id, f.md5))

  it('is settled after one pass: comparing again changes nothing', () => {
    fc.assert(
      fc.property(library, drive, fc.boolean(), (bs, fs, complete) => {
        const books = toBooks(bs)
        const files = toFiles(fs)
        const once = applyPatches(books, compareWithDrive(books, files, complete))
        expect(compareWithDrive(once, files, complete)).toEqual([])
      }),
    )
  })

  it('never touches books from this device, and never marks missing from a partial list', () => {
    fc.assert(
      fc.property(library, drive, (bs, fs) => {
        const books = toBooks(bs)
        const local = new Set(books.filter((b) => b.source === 'local').map((b) => b.id))
        const partial = compareWithDrive(books, toFiles(fs), false)
        expect(partial.some((c) => local.has(c.id))).toBe(false)
        expect(partial.some((c) => c.patch.missingInDrive === true)).toBe(false)
      }),
    )
  })

  it('after a complete pass, a Drive book is missing exactly when Drive does not list it', () => {
    fc.assert(
      fc.property(library, drive, (bs, fs) => {
        const books = toBooks(bs)
        const listed = new Set(fs.map((f) => f.id))
        const after = applyPatches(books, compareWithDrive(books, toFiles(fs), true))
        for (const b of after.filter((x) => x.source === 'drive'))
          expect(!!b.missingInDrive).toBe(!listed.has(b.id))
      }),
    )
  })
})
