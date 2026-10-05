import { defineStore } from 'pinia'
import { computed, ref, toRaw } from 'vue'

import type { BookRecord, ProgressRecord } from '@/domain/book'
import { useServices } from '@/services'
import type { AppDataFile } from '@/services/drive/appdata'
import type { DriveError, DriveFile } from '@/services/drive/client'
import { track } from '@/services/events'
import type { SyncMeta } from '@/services/storage/db'
import { compareWithDrive } from '@/services/sync/driveCheck'
import {
  decideProgress,
  type LibraryDoc,
  type LibraryEntry,
  libraryChanges,
  mergeLibrary,
  type RemoteProgress,
  type SyncedProgress,
  toSynced,
} from '@/services/sync/merge'
import { isNone, unwrapOr } from '@/shared/result'

import { useAuth } from './auth'
import { useLibrary } from './library'
import { useReader } from './reader'

/**
 * Progress and library sync through the Drive app folder (architecture doc, "Progress sync").
 * Writes are local first; Drive gets them 20 s after the last page turn, when the tab is hidden,
 * and on "Sync now". Pulls run on app start, book open, back online and reconnect. Nothing polls.
 * Only Drive books sync; books opened from a local file stay on this device.
 */

export type SyncStatus = 'idle' | 'syncing' | 'offline' | 'reconnect' | 'error'

/** A position from the other side of a conflict, offered to the reader once. */
export type Offer = Pick<ProgressRecord, 'locator' | 'fraction' | 'device' | 'updatedAt'>

const IDLE_MS = 20_000
const DRIVE_CHECK_EVERY_MS = 24 * 3_600_000
/** searchBooks stops here; a listing this long may be cut short. */
const DRIVE_LIST_MAX = 5000
const LIBRARY_FILE = 'library.json'
const progressFile = (id: string) => `progress-${id}.json`
const LOCK = 'drive-read-sync'

const emptyMeta = (): SyncMeta => ({
  v: 1,
  library: { entries: [], dirty: false },
  lastSyncAt: null,
})

const toOffer = (r: Offer): Offer => ({
  locator: r.locator,
  fraction: r.fraction,
  device: r.device,
  updatedAt: r.updatedAt,
})

const sameEntries = (a: readonly LibraryEntry[], b: readonly LibraryEntry[]) =>
  JSON.stringify(mergeLibrary(a, [])) === JSON.stringify(mergeLibrary(b, []))

/** Runs `fn` under a cross-tab lock, so two tabs never push at once. */
function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const locks = (navigator as Navigator & { locks?: LockManager }).locks
  return locks ? (locks.request(LOCK, fn) as Promise<T>) : fn()
}

export const useSync = defineStore('sync', () => {
  const status = ref<SyncStatus>('idle')
  const meta = ref<SyncMeta>(emptyMeta())
  const offers = ref<Record<string, Offer>>({})
  let timer: ReturnType<typeof setTimeout> | undefined
  /** What the current pass did (sync.completed). */
  let stats = { pushed: 0, adopted: 0, offered: 0, library_changes: 0 }

  const library = useLibrary()
  const driveBooks = () => library.books.filter((b) => b.source === 'drive')

  const pending = computed(
    () =>
      driveBooks().filter((b) => library.progress[b.id]?.dirty).length +
      (meta.value.library.dirty ? 1 : 0),
  )
  const lastSyncAt = computed(() => meta.value.lastSyncAt)

  async function load() {
    meta.value = unwrapOr(await useServices().db.getSyncMeta(), emptyMeta())
  }

  // Plain copy: IndexedDB cannot clone a reactive proxy.
  const saveMeta = () =>
    useServices().db.putSyncMeta(JSON.parse(JSON.stringify(meta.value)) as SyncMeta)

  function upsert(entry: LibraryEntry) {
    const rest = meta.value.library.entries.filter((e) => e.fileId !== entry.fileId)
    meta.value.library = { ...meta.value.library, entries: [...rest, entry], dirty: true }
  }

  const entryOf = (b: BookRecord, updatedAt: string, removed = false): LibraryEntry => ({
    fileId: b.id,
    md5: b.md5 ?? null,
    name: b.fileName,
    addedAt: b.addedAt,
    updatedAt,
    removed,
  })

  async function noteAdded(books: readonly BookRecord[]) {
    const now = useServices().now().toISOString()
    for (const b of books) if (b.source === 'drive') upsert(entryOf(b, now))
    await saveMeta()
    nudge()
  }

  async function noteRemoved(id: string) {
    const now = useServices().now().toISOString()
    const known = meta.value.library.entries.find((e) => e.fileId === id)
    upsert(
      known
        ? { ...known, updatedAt: now, removed: true }
        : { fileId: id, md5: null, name: '', addedAt: now, updatedAt: now, removed: true },
    )
    await saveMeta()
    nudge()
  }

  /** Restart the idle timer: a push follows 20 s after the last change. */
  function nudge() {
    clearTimeout(timer)
    timer = setTimeout(() => void push(), IDLE_MS)
  }

  function token(): string | null {
    const t = useAuth().validToken()
    if (isNone(t)) {
      status.value = 'reconnect'
      return null
    }
    return t.value
  }

  function failed(e: DriveError) {
    if (e.kind === 'auth-expired') {
      useAuth().markExpired('sync')
      status.value = 'reconnect'
    } else status.value = e.kind === 'offline' ? 'offline' : 'error'
    track('sync.failed', { reason: e.kind, pending: pending.value })
  }

  /** Merges library.json into this device and applies the result to the library. */
  async function syncLibrary(tok: string, files: AppDataFile[]): Promise<DriveError | null> {
    const { appdata, now } = useServices()
    const stamp = now().toISOString()
    // Books added before sync existed (or on a device that never synced) join the list.
    const known = new Set(meta.value.library.entries.map((e) => e.fileId))
    for (const b of driveBooks()) if (!known.has(b.id)) upsert(entryOf(b, stamp))

    const remote = files.find((f) => f.name === LIBRARY_FILE)
    if (remote && remote.modifiedTime !== meta.value.library.remoteModifiedTime) {
      const r = await appdata.read(tok, remote.id)
      if (r._tag === 'Err') return r.error
      const remoteEntries = (r.value as Partial<LibraryDoc>).entries ?? []
      const merged = mergeLibrary(meta.value.library.entries, remoteEntries)
      meta.value.library = {
        entries: merged,
        remoteId: remote.id,
        remoteModifiedTime: remote.modifiedTime,
        dirty: meta.value.library.dirty || !sameEntries(merged, remoteEntries),
      }
    }

    const changes = libraryChanges(
      meta.value.library.entries,
      driveBooks().map((b) => b.id),
    )
    if (changes.toAdd.length > 0) {
      const asFiles: DriveFile[] = changes.toAdd.map((e) => ({
        id: e.fileId,
        name: e.name,
        mimeType: 'application/epub+zip',
        size: 0,
        md5: e.md5,
        modifiedTime: '',
      }))
      await library.addFromDrive(asFiles, { fromSync: true })
      stats.library_changes += asFiles.length
    }
    for (const id of changes.toRemove) {
      if (useReader().bookId === id) continue // never pull the book out from under the reader
      await library.remove(id, { fromSync: true })
      stats.library_changes++
    }
    await saveMeta()
    return null
  }

  /** Reads changed progress records and adopts, pushes or offers as the conflict rule says. */
  async function syncProgress(tok: string, files: AppDataFile[]): Promise<DriveError | null> {
    const { appdata } = useServices()
    const openId = useReader().bookId
    for (const book of driveBooks()) {
      const file = files.find((f) => f.name === progressFile(book.id))
      const local = library.progress[book.id]
      if (!file || file.modifiedTime === local?.remoteModifiedTime) continue

      const r = await appdata.read(tok, file.id)
      if (r._tag === 'Err') return r.error
      const remote: RemoteProgress = {
        id: file.id,
        modifiedTime: file.modifiedTime,
        record: r.value as SyncedProgress,
      }
      const decision = decideProgress(local, remote)

      if (decision.action === 'adopt') {
        if (book.id === openId) {
          // The reader asks before moving the page.
          offers.value[book.id] = toOffer(remote.record)
          stats.offered++
          if (local) await library.markSynced(book.id, file.id, file.modifiedTime)
          continue
        }
        await library.applyRemoteProgress({
          ...remote.record,
          dirty: false,
          remoteId: file.id,
          remoteModifiedTime: file.modifiedTime,
        })
        stats.adopted++
        if (decision.offer === 'local' && local) {
          offers.value[book.id] = toOffer(toRaw(local))
          stats.offered++
        }
      } else if (decision.action === 'push') {
        if (decision.offer === 'remote') {
          offers.value[book.id] = toOffer(remote.record)
          stats.offered++
        }
        await library.markSynced(book.id, file.id, file.modifiedTime)
      }
    }
    return null
  }

  /** Pushes dirty positions and library.json. Expects `files` from a fresh list. */
  async function pushAll(
    tok: string,
    files: AppDataFile[],
    opts: { keepalive?: boolean },
  ): Promise<DriveError | null> {
    const { appdata } = useServices()
    const idOf = (name: string) => files.find((f) => f.name === name)?.id

    for (const book of driveBooks()) {
      const rec = library.progress[book.id]
      if (!rec?.dirty) continue
      const name = progressFile(book.id)
      const existing = idOf(name)
      const body = toSynced(toRaw(rec))
      const r = existing
        ? await appdata.update(tok, existing, body, opts)
        : await appdata.create(tok, name, body, opts)
      if (r._tag === 'Err') return r.error
      await library.markSynced(book.id, r.value.id, r.value.modifiedTime, rec.updatedAt)
      stats.pushed++
    }

    if (meta.value.library.dirty) {
      // Plain copy: the entries array can hold reactive proxies.
      const doc: LibraryDoc = {
        v: 1,
        entries: JSON.parse(JSON.stringify(meta.value.library.entries)),
      }
      const existing = idOf(LIBRARY_FILE)
      const r = existing
        ? await appdata.update(tok, existing, doc, opts)
        : await appdata.create(tok, LIBRARY_FILE, doc, opts)
      if (r._tag === 'Err') return r.error
      meta.value.library = {
        ...meta.value.library,
        remoteId: r.value.id,
        remoteModifiedTime: r.value.modifiedTime,
        dirty: false,
      }
      stats.pushed++
      await saveMeta()
    }
    return null
  }

  /**
   * One sync pass. `full` pulls everything first (start, open, online, reconnect, Sync now);
   * otherwise only library.json is merged before pushing, so a push never overwrites another
   * device's library changes.
   */
  async function run(full: boolean, opts: { keepalive?: boolean } = {}) {
    clearTimeout(timer)
    const tok = token()
    if (!tok) return
    await withLock(async () => {
      status.value = 'syncing'
      stats = { pushed: 0, adopted: 0, offered: 0, library_changes: 0 }
      const started = performance.now()
      const { appdata, now } = useServices()
      const listed = await appdata.list(tok)
      if (listed._tag === 'Err') return failed(listed.error)
      const files = listed.value

      const libErr = await syncLibrary(tok, files)
      if (libErr) return failed(libErr)
      if (full) {
        const progErr = await syncProgress(tok, files)
        if (progErr) return failed(progErr)
      }
      const pushErr = await pushAll(tok, files, opts)
      if (pushErr) return failed(pushErr)

      meta.value.lastSyncAt = now().toISOString()
      if (full) await checkDrive(tok)
      await saveMeta()
      status.value = 'idle'
      track('sync.completed', { ms: performance.now() - started, ...stats })
    })
  }

  /**
   * Once a day: are the library's Drive files still there, and unchanged? One listing of every
   * book in Drive answers both (sync/driveCheck.ts). A failure only skips the check; it runs
   * again on the next full pass.
   */
  async function checkDrive(tok: string) {
    const { drive, now } = useServices()
    const last = meta.value.driveCheckedAt
    if (last && now().getTime() - Date.parse(last) < DRIVE_CHECK_EVERY_MS) return
    const books = driveBooks()
    if (books.length === 0) return
    const started = performance.now()
    const listed = await drive.searchBooks(tok, '')
    if (listed._tag === 'Err') {
      if (listed.error.kind === 'auth-expired') useAuth().markExpired('sync')
      track('drive.check_failed', { reason: listed.error.kind })
      return
    }
    const complete = listed.value.length < DRIVE_LIST_MAX
    const changes = compareWithDrive(books, listed.value, complete)
    await library.applyDriveChanges(changes)
    meta.value.driveCheckedAt = now().toISOString()
    track('drive.checked', {
      ms: performance.now() - started,
      books: books.length,
      missing: library.books.filter((b) => b.source === 'drive' && b.missingInDrive).length,
      new_versions: library.books.filter((b) => b.driveVersion).length,
      complete,
    })
  }

  /** Pull, then push. */
  const syncNow = () => run(true)
  /** Push waiting changes (idle timer, tab hidden). */
  const push = (opts: { keepalive?: boolean } = {}) => run(false, opts)

  /** The other position from a conflict or a newer one for the open book, at most once. */
  function takeOffer(id: string): Offer | undefined {
    const offer = offers.value[id]
    delete offers.value[id]
    return offer
  }

  return {
    status,
    pending,
    lastSyncAt,
    offers,
    load,
    noteAdded,
    noteRemoved,
    nudge,
    syncNow,
    push,
    takeOffer,
  }
})
