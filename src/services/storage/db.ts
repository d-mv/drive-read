import type { BookRecord, ProgressRecord } from '@/domain/book'
import type { Settings } from '@/domain/settings'
import type { LibraryEntry } from '@/services/sync/merge'
import { Err, Ok, type Option, option, type Result } from '@/shared/result'

import { done, openDatabase, request } from './idb'

/** IndexedDB: the library, reading positions and settings. The source of truth for the UI. */

/** Sync state (v2): this device's view of library.json and when it last synced. */
export interface SyncMeta {
  v: 1
  library: {
    entries: LibraryEntry[]
    remoteId?: string
    remoteModifiedTime?: string
    /** Local changes not yet in Drive. */
    dirty: boolean
  }
  lastSyncAt: string | null
  /** Last daily check of the library's Drive files (sync/driveCheck.ts). */
  driveCheckedAt?: string
}

interface Stores {
  books: BookRecord
  progress: ProgressRecord
  settings: Settings
  meta: SyncMeta
}
type StoreName = keyof Stores

export type StorageError = { kind: 'quota' } | { kind: 'unknown'; message: string }

export const toStorageError = (e: unknown): StorageError =>
  e instanceof DOMException && e.name === 'QuotaExceededError'
    ? { kind: 'quota' }
    : { kind: 'unknown', message: e instanceof Error ? e.message : String(e) }

async function write(fn: () => Promise<unknown>): Promise<Result<void, StorageError>> {
  try {
    await fn()
    return Ok(undefined)
  } catch (e) {
    return Err(toStorageError(e))
  }
}

const SETTINGS_KEY = 'settings'
const SYNC_KEY = 'sync'

export async function openDb(name = 'drive-read') {
  const db = await openDatabase(name, 2, (d, oldVersion) => {
    // Records carry `v`; later migrations go here, keyed on oldVersion.
    if (oldVersion < 1) {
      d.createObjectStore('books', { keyPath: 'id' })
      d.createObjectStore('progress', { keyPath: 'fileId' })
      d.createObjectStore('settings')
    }
    if (oldVersion < 2) d.createObjectStore('meta')
  })

  const get = async <S extends StoreName>(store: S, key: string): Promise<Option<Stores[S]>> =>
    option(await request<Stores[S] | undefined>(db.transaction(store).objectStore(store).get(key)))
  const getAll = <S extends StoreName>(store: S): Promise<Stores[S][]> =>
    request<Stores[S][]>(db.transaction(store).objectStore(store).getAll())
  /** Resolves once the write is committed, like a write that reached disk. */
  const put = <S extends StoreName>(store: S, value: Stores[S], key?: string) =>
    write(() => {
      const tx = db.transaction(store, 'readwrite')
      const committed = done(tx)
      tx.objectStore(store).put(value, key)
      return committed
    })

  return {
    getBook: (id: string) => get('books', id),
    allBooks: () => getAll('books'),
    putBook: (book: BookRecord) => put('books', book),
    /** Removes the book and its reading position together. */
    deleteBook: (id: string) =>
      write(() => {
        const tx = db.transaction(['books', 'progress'], 'readwrite')
        const committed = done(tx)
        tx.objectStore('books').delete(id)
        tx.objectStore('progress').delete(id)
        return committed
      }),

    getProgress: (id: string) => get('progress', id),
    allProgress: () => getAll('progress'),
    putProgress: (p: ProgressRecord) => put('progress', p),

    getSettings: () => get('settings', SETTINGS_KEY),
    putSettings: (s: Settings) => put('settings', s, SETTINGS_KEY),

    getSyncMeta: () => get('meta', SYNC_KEY),
    putSyncMeta: (m: SyncMeta) => put('meta', m, SYNC_KEY),
  }
}

export type Db = Awaited<ReturnType<typeof openDb>>
