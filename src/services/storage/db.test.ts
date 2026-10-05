import { beforeEach, describe, expect, it } from 'vitest'

import type { BookRecord, ProgressRecord } from '@/domain/book'
import { DEFAULT_SETTINGS } from '@/domain/settings'
import { None, Ok, Some } from '@/shared/result'

import { type Db, openDb } from './db'
import { done, openDatabase } from './idb'

const book = (id: string): BookRecord => ({
  v: 1,
  id,
  source: 'local',
  format: 'epub',
  fileName: `${id}.epub`,
  title: id,
  author: '',
  size: 10,
  toc: [],
  hasCover: false,
  downloaded: true,
  addedAt: '2026-10-04T10:00:00Z',
  openedAt: null,
})

const progress = (fileId: string, fraction: number): ProgressRecord => ({
  v: 1,
  fileId,
  locator: { kind: 'cfi', cfi: 'epubcfi(/6/4!/4/2/1:0)' },
  fraction,
  updatedAt: '2026-10-04T10:00:00Z',
  device: { id: 'dev1', name: 'Laptop' },
  dirty: true,
  bookmarks: [],
})

let db: Db
let n = 0
beforeEach(async () => {
  db = await openDb(`test-${++n}`)
})

describe('books', () => {
  it('stores, reads, lists and deletes', async () => {
    expect(await db.putBook(book('a'))).toEqual(Ok(undefined))
    await db.putBook(book('b'))
    expect(await db.getBook('a')).toEqual(Some(book('a')))
    expect((await db.allBooks()).map((b) => b.id).sort()).toEqual(['a', 'b'])
    await db.deleteBook('a')
    expect(await db.getBook('a')).toEqual(None)
  })
})

describe('progress', () => {
  it('stores one record per book and deletes it with the book', async () => {
    await db.putBook(book('a'))
    await db.putProgress(progress('a', 0.1))
    await db.putProgress(progress('a', 0.4))
    expect(await db.getProgress('a')).toEqual(Some(progress('a', 0.4)))
    expect(await db.allProgress()).toEqual([progress('a', 0.4)])
    await db.deleteBook('a')
    expect(await db.getProgress('a')).toEqual(None)
  })
})

describe('settings', () => {
  it('returns None before anything is saved, then the saved value', async () => {
    expect(await db.getSettings()).toEqual(None)
    await db.putSettings({ ...DEFAULT_SETTINGS, size: 22 })
    expect(await db.getSettings()).toEqual(Some({ ...DEFAULT_SETTINGS, size: 22 }))
  })
})

describe('sync meta (v2)', () => {
  it('returns None before anything is saved, then the saved value', async () => {
    expect(await db.getSyncMeta()).toEqual(None)
    const meta = {
      v: 1 as const,
      library: { entries: [], dirty: true },
      lastSyncAt: null,
    }
    await db.putSyncMeta(meta)
    expect(await db.getSyncMeta()).toEqual(Some(meta))
  })

  it('upgrades a v1 database without losing books', async () => {
    const name = `migrate-${++n}`
    const v1 = await openDatabase(name, 1, (d) => {
      d.createObjectStore('books', { keyPath: 'id' })
      d.createObjectStore('progress', { keyPath: 'fileId' })
      d.createObjectStore('settings')
    })
    const tx = v1.transaction('books', 'readwrite')
    tx.objectStore('books').put(book('old'))
    await done(tx)
    v1.close()

    const upgraded = await openDb(name)
    expect(await upgraded.getBook('old')).toEqual(Some(book('old')))
    expect(await upgraded.getSyncMeta()).toEqual(None)
  })
})
