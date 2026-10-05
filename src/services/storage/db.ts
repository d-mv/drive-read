import { type DBSchema, type IDBPDatabase, openDB } from 'idb'

import type { BookRecord, ProgressRecord } from '@/domain/book'
import type { Settings } from '@/domain/settings'
import type { LibraryEntry } from '@/services/sync/merge'
import { Err, Ok, type Option, option, type Result } from '@/shared/result'

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
}

interface Schema extends DBSchema {
  books: { key: string; value: BookRecord }
  progress: { key: string; value: ProgressRecord }
  settings: { key: string; value: Settings }
  meta: { key: string; value: SyncMeta }
}

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
  const db: IDBPDatabase<Schema> = await openDB<Schema>(name, 2, {
    upgrade(db, oldVersion) {
      // Records carry `v`; later migrations go here, keyed on oldVersion.
      if (oldVersion < 1) {
        db.createObjectStore('books', { keyPath: 'id' })
        db.createObjectStore('progress', { keyPath: 'fileId' })
        db.createObjectStore('settings')
      }
      if (oldVersion < 2) db.createObjectStore('meta')
    },
  })

  return {
    getBook: async (id: string): Promise<Option<BookRecord>> => option(await db.get('books', id)),
    allBooks: (): Promise<BookRecord[]> => db.getAll('books'),
    putBook: (book: BookRecord) => write(() => db.put('books', book)),
    /** Removes the book and its reading position together. */
    deleteBook: (id: string) =>
      write(async () => {
        const tx = db.transaction(['books', 'progress'], 'readwrite')
        await Promise.all([
          tx.objectStore('books').delete(id),
          tx.objectStore('progress').delete(id),
          tx.done,
        ])
      }),

    getProgress: async (id: string): Promise<Option<ProgressRecord>> =>
      option(await db.get('progress', id)),
    allProgress: (): Promise<ProgressRecord[]> => db.getAll('progress'),
    putProgress: (p: ProgressRecord) => write(() => db.put('progress', p)),

    getSettings: async (): Promise<Option<Settings>> =>
      option(await db.get('settings', SETTINGS_KEY)),
    putSettings: (s: Settings) => write(() => db.put('settings', s, SETTINGS_KEY)),

    getSyncMeta: async (): Promise<Option<SyncMeta>> => option(await db.get('meta', SYNC_KEY)),
    putSyncMeta: (m: SyncMeta) => write(() => db.put('meta', m, SYNC_KEY)),
  }
}

export type Db = Awaited<ReturnType<typeof openDb>>
