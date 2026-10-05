import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import type { BookRecord, ProgressRecord } from '@/domain/book'
import { DEFAULT_SETTINGS } from '@/domain/settings'

import { openDb } from './db'
import { None, Ok, option } from '@/shared/result'

/**
 * Model-based property test: random operation sequences give the same result at every step
 * from the IndexedDB store and from a plain in-memory model of what it should do. (Before idb
 * was removed, the same sequences matched the idb-based implementation over 200 runs.)
 */

const ids = fc.constantFrom('a', 'b', 'c', 'd')

const book = (id: string, size: number): BookRecord => ({
  v: 1,
  id,
  source: 'drive',
  format: 'epub',
  fileName: `${id}.epub`,
  title: id,
  author: '',
  size,
  toc: [],
  hasCover: false,
  downloaded: size % 2 === 0,
  addedAt: '2026-10-04T10:00:00Z',
  openedAt: null,
})

const progress = (fileId: string, fraction: number): ProgressRecord => ({
  v: 1,
  fileId,
  locator: { kind: 'page', page: 1, offset: fraction },
  fraction,
  updatedAt: '2026-10-04T10:00:00Z',
  device: { id: 'dev1', name: 'Laptop' },
  dirty: true,
  bookmarks: [],
})

type Op =
  | { op: 'putBook'; id: string; size: number }
  | { op: 'getBook'; id: string }
  | { op: 'allBooks' }
  | { op: 'deleteBook'; id: string }
  | { op: 'putProgress'; id: string; fraction: number }
  | { op: 'getProgress'; id: string }
  | { op: 'allProgress' }
  | { op: 'putSettings'; size: number }
  | { op: 'getSettings' }
  | { op: 'putSyncMeta'; dirty: boolean }
  | { op: 'getSyncMeta' }

const opArb: fc.Arbitrary<Op> = fc.oneof(
  fc.record({ op: fc.constant('putBook' as const), id: ids, size: fc.nat(100) }),
  fc.record({ op: fc.constant('getBook' as const), id: ids }),
  fc.constant({ op: 'allBooks' as const }),
  fc.record({ op: fc.constant('deleteBook' as const), id: ids }),
  fc.record({
    op: fc.constant('putProgress' as const),
    id: ids,
    fraction: fc.double({ min: 0, max: 1, noNaN: true }),
  }),
  fc.record({ op: fc.constant('getProgress' as const), id: ids }),
  fc.constant({ op: 'allProgress' as const }),
  fc.record({ op: fc.constant('putSettings' as const), size: fc.integer({ min: 12, max: 32 }) }),
  fc.constant({ op: 'getSettings' as const }),
  fc.record({ op: fc.constant('putSyncMeta' as const), dirty: fc.boolean() }),
  fc.constant({ op: 'getSyncMeta' as const }),
)

type AnyDb = Awaited<ReturnType<typeof openDb>>

/** What the store should do: maps per store, books and progress deleted together. */
function model(): AnyDb {
  const stores = { books: new Map(), progress: new Map(), settings: new Map(), meta: new Map() }
  const copy = <T>(v: T): T => structuredClone(v)
  const get = (m: Map<string, unknown>, k: string) => Promise.resolve(option(copy(m.get(k))))
  const all = (m: Map<string, unknown>) =>
    Promise.resolve([...m.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([, v]) => copy(v)))
  const set = (m: Map<string, unknown>, k: string, v: unknown) => {
    m.set(k, copy(v))
    return Promise.resolve(Ok(undefined))
  }
  return {
    getBook: (id) => get(stores.books, id),
    allBooks: () => all(stores.books),
    putBook: (b) => set(stores.books, b.id, b),
    deleteBook: (id) => {
      stores.books.delete(id)
      stores.progress.delete(id)
      return Promise.resolve(Ok(undefined))
    },
    getProgress: (id) => get(stores.progress, id),
    allProgress: () => all(stores.progress),
    putProgress: (p) => set(stores.progress, p.fileId, p),
    getSettings: () => get(stores.settings, 'settings'),
    putSettings: (s) => set(stores.settings, 'settings', s),
    getSyncMeta: () => (stores.meta.has('sync') ? get(stores.meta, 'sync') : Promise.resolve(None)),
    putSyncMeta: (m) => set(stores.meta, 'sync', m),
  } as AnyDb
}

async function run(db: AnyDb, o: Op): Promise<unknown> {
  switch (o.op) {
    case 'putBook':
      return db.putBook(book(o.id, o.size))
    case 'getBook':
      return db.getBook(o.id)
    case 'allBooks':
      return db.allBooks()
    case 'deleteBook':
      return db.deleteBook(o.id)
    case 'putProgress':
      return db.putProgress(progress(o.id, o.fraction))
    case 'getProgress':
      return db.getProgress(o.id)
    case 'allProgress':
      return db.allProgress()
    case 'putSettings':
      return db.putSettings({ ...DEFAULT_SETTINGS, size: o.size })
    case 'getSettings':
      return db.getSettings()
    case 'putSyncMeta':
      return db.putSyncMeta({
        v: 1,
        library: { entries: [], dirty: o.dirty },
        lastSyncAt: null,
      })
    case 'getSyncMeta':
      return db.getSyncMeta()
  }
}

let n = 0
describe('db against an in-memory model', () => {
  it('agrees on every result of random operation sequences', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(opArb, { maxLength: 30 }), async (ops) => {
        const run_ = ++n
        const next = await openDb(`cmp-new-${run_}`)
        const ref = model()
        for (const o of ops) expect(await run(next, o)).toEqual(await run(ref, o))
      }),
      { numRuns: 200 },
    )
  })
})
