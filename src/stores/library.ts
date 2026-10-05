import { defineStore } from 'pinia'
import { computed, ref, toRaw } from 'vue'

import {
  type BookRecord,
  type LibraryItem,
  type ProgressRecord,
  readingStatus,
  titleFromFileName,
} from '@/domain/book'
import { useServices } from '@/services'
import type { DriveFile } from '@/services/drive/client'
import { bookFromFileName } from '@/services/drive/names'
import type { BookMeta, Position } from '@/services/engine/types'
import { track } from '@/services/events'
import { bookPath, coverPath } from '@/services/storage/blobs'
import { requestPersistence } from '@/services/storage/persist'
import { isErr, isNone } from '@/shared/result'

import { useSync } from './sync'

export type ImportFailure = 'unsupported' | 'unreadable' | 'quota' | 'storage'

export interface ImportResult {
  /** Added books, and books already in the library that the same bytes matched. */
  added: BookRecord[]
  failed: { name: string; reason: ImportFailure }[]
}

export type LibraryEntry = LibraryItem & { book: BookRecord }

/** EPUB or PDF, by type or extension (some browsers give no type); null for anything else. */
function formatOf(f: { type: string; name: string }): BookRecord['format'] | null {
  if (f.type === 'application/epub+zip' || /\.epub$/i.test(f.name)) return 'epub'
  if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) return 'pdf'
  return null
}

/** The library: book records, reading positions, and importing files from this device. */
export const useLibrary = defineStore('library', () => {
  const books = ref<BookRecord[]>([])
  const progress = ref<Record<string, ProgressRecord>>({})
  const loaded = ref(false)

  const items = computed<LibraryEntry[]>(() =>
    books.value.map((book) => ({
      id: book.id,
      title: book.title,
      author: book.author,
      fraction: progress.value[book.id]?.fraction,
      activityAt: book.openedAt ?? book.addedAt,
      book,
    })),
  )

  /** The unfinished book read most recently, on any device (positions sync). */
  const continueBook = computed(() => {
    const lastRead = (id: string) => progress.value[id]?.updatedAt ?? ''
    return books.value
      .filter((b) => readingStatus(progress.value[b.id]?.fraction) === 'reading')
      .sort((a, b) => lastRead(b.id).localeCompare(lastRead(a.id)))[0]
  })

  async function load() {
    const { db } = useServices()
    const [allBooks, allProgress] = await Promise.all([db.allBooks(), db.allProgress()])
    books.value = allBooks
    progress.value = Object.fromEntries(allProgress.map((p) => [p.fileId, p]))
    loaded.value = true
  }

  async function importOne(file: File): Promise<BookRecord | ImportFailure> {
    const { db, blobs, createEngine, bookId, now } = useServices()
    const format = formatOf(file)
    if (!format) return 'unsupported'

    const id = await bookId(file)
    const existing = books.value.find((b) => b.id === id)
    if (existing) return existing

    const engine = createEngine(format)
    const meta = await engine.open(file)
    engine.destroy()
    if (isErr(meta)) return 'unreadable'

    const stored = await blobs.put(bookPath(id), file)
    if (isErr(stored)) return stored.error.kind === 'quota' ? 'quota' : 'storage'

    const hasCover = meta.value.cover
      ? !isErr(await blobs.put(coverPath(id), meta.value.cover))
      : false
    const record: BookRecord = {
      v: 1,
      id,
      source: 'local',
      format,
      fileName: file.name,
      title: meta.value.title.trim() || titleFromFileName(file.name),
      author: meta.value.author,
      size: file.size,
      toc: meta.value.toc,
      hasCover,
      downloaded: true,
      addedAt: now().toISOString(),
      openedAt: null,
    }
    const saved = await db.putBook(record)
    if (isErr(saved)) {
      await Promise.all([blobs.remove(bookPath(id)), blobs.remove(coverPath(id))])
      return saved.error.kind === 'quota' ? 'quota' : 'storage'
    }
    books.value.push(record)
    return record
  }

  async function importFiles(files: readonly File[]): Promise<ImportResult> {
    const result: ImportResult = { added: [], failed: [] }
    for (const file of files) {
      const r = await importOne(file)
      if (typeof r === 'string') result.failed.push({ name: file.name, reason: r })
      else result.added.push(r)
    }
    track('library.imported', {
      source: 'local',
      added: result.added.length,
      failed: result.failed.length,
      reason: result.failed[0]?.reason ?? null,
    })
    // Ask once books are stored, so the browser keeps them under storage pressure.
    if (result.added.length > 0) void requestPersistence()
    return result
  }

  async function markOpened(id: string) {
    const { db, now } = useServices()
    const book = books.value.find((b) => b.id === id)
    if (!book) return
    book.openedAt = now().toISOString()
    await db.putBook({ ...toRaw(book) })
  }

  /** Written on every page turn. `dirty` marks it for the sync queue; Drive books nudge it. */
  async function saveProgress(id: string, position: Position) {
    const { db, now, device } = useServices()
    const prev = progress.value[id]
    const record: ProgressRecord = {
      v: 1,
      fileId: id,
      locator: position.locator,
      fraction: position.fraction,
      updatedAt: now().toISOString(),
      device: { ...device },
      dirty: true,
      bookmarks: [],
      ...(prev?.remoteId ? { remoteId: prev.remoteId } : {}),
      ...(prev?.remoteModifiedTime ? { remoteModifiedTime: prev.remoteModifiedTime } : {}),
    }
    progress.value[id] = record
    const saved = await db.putProgress(record)
    if (isErr(saved)) track('storage.write_failed', { what: 'progress', reason: saved.error.kind })
    if (books.value.find((b) => b.id === id)?.source === 'drive') useSync().nudge()
  }

  /** A position from another device, adopted as is (not dirty). */
  async function applyRemoteProgress(record: ProgressRecord) {
    progress.value[record.fileId] = record
    await useServices().db.putProgress({ ...record })
  }

  /**
   * After a push or pull: remember the Drive file and the modifiedTime seen. The record stays
   * dirty if it changed after `pushedUpdatedAt` (a page turned while the push was in flight).
   */
  async function markSynced(
    id: string,
    remoteId: string,
    remoteModifiedTime: string,
    pushedUpdatedAt?: string,
  ) {
    // Raw copy: IndexedDB cannot clone the store's reactive proxies.
    const rec = toRaw(progress.value[id])
    if (!rec) return
    const clean = pushedUpdatedAt !== undefined && rec.updatedAt === pushedUpdatedAt
    const next = { ...rec, remoteId, remoteModifiedTime, dirty: clean ? false : rec.dirty }
    progress.value[id] = next
    await useServices().db.putProgress(next)
  }

  /**
   * Registers Drive books (architecture doc, book pipeline step 2). Nothing is downloaded yet:
   * the file comes down on first open, and the title is a guess from the file name until then.
   */
  async function addFromDrive(
    files: readonly DriveFile[],
    opts: { fromSync?: boolean } = {},
  ): Promise<ImportResult> {
    const { db, now } = useServices()
    const result: ImportResult = { added: [], failed: [] }
    const before = new Set(books.value.map((b) => b.id))
    for (const file of files) {
      const existing = books.value.find((b) => b.id === file.id)
      if (existing) {
        result.added.push(existing)
        continue
      }
      const format = formatOf({ type: file.mimeType, name: file.name })
      if (!format) {
        result.failed.push({ name: file.name, reason: 'unsupported' })
        continue
      }
      const guess = bookFromFileName(file.name)
      const record: BookRecord = {
        v: 1,
        id: file.id,
        source: 'drive',
        format,
        fileName: file.name,
        title: guess.title,
        author: guess.author,
        size: file.size,
        toc: [],
        hasCover: false,
        downloaded: false,
        addedAt: now().toISOString(),
        openedAt: null,
        md5: file.md5,
        provisional: true,
      }
      const saved = await db.putBook(record)
      if (isErr(saved)) {
        result.failed.push({
          name: file.name,
          reason: saved.error.kind === 'quota' ? 'quota' : 'storage',
        })
        continue
      }
      books.value.push(record)
      result.added.push(record)
    }
    const created = result.added.filter((b) => !before.has(b.id))
    if (!opts.fromSync) {
      track('library.imported', {
        source: 'drive',
        added: created.length,
        failed: result.failed.length,
        reason: result.failed[0]?.reason ?? null,
      })
      if (created.length > 0) {
        await useSync().noteAdded(created)
        void requestPersistence()
      }
    }
    return result
  }

  async function update(id: string, patch: Partial<BookRecord>) {
    const book = books.value.find((b) => b.id === id)
    if (!book) return
    Object.assign(book, patch)
    const saved = await useServices().db.putBook({ ...toRaw(book) })
    if (isErr(saved)) track('storage.write_failed', { what: 'book', reason: saved.error.kind })
  }

  /** The file is (or is no longer) on this device. */
  const setDownloaded = (id: string, downloaded: boolean) => update(id, { downloaded })

  /** Title, author, contents and cover from the opened book replace the file-name guess. */
  async function applyMeta(id: string, meta: BookMeta) {
    const hasCover = meta.cover
      ? !isErr(await useServices().blobs.put(coverPath(id), meta.cover))
      : false
    const book = books.value.find((b) => b.id === id)
    await update(id, {
      title: meta.title.trim() || book?.title || '',
      author: meta.author || book?.author || '',
      toc: meta.toc,
      hasCover,
      provisional: false,
    })
  }

  /** `fromSync`: the removal came from another device, so it is not reported back. */
  /**
   * Books recorded as downloaded whose file is gone (the browser evicted it under storage
   * pressure) go back to "Drive only"; they download again on open. Returns how many.
   */
  async function verifyDownloads(): Promise<number> {
    const { blobs } = useServices()
    let evicted = 0
    for (const b of books.value.filter((x) => x.source === 'drive' && x.downloaded)) {
      if (isNone(await blobs.get(bookPath(b.id)))) {
        await setDownloaded(b.id, false)
        evicted++
      }
    }
    if (evicted > 0) track('storage.evicted', { books: evicted })
    return evicted
  }

  async function remove(id: string, opts: { fromSync?: boolean } = {}) {
    const { db, blobs } = useServices()
    const source = books.value.find((b) => b.id === id)?.source
    const wasDrive = source === 'drive'
    await Promise.all([blobs.remove(bookPath(id)), blobs.remove(coverPath(id)), db.deleteBook(id)])
    books.value = books.value.filter((b) => b.id !== id)
    delete progress.value[id]
    if (source && !opts.fromSync) track('library.removed', { source })
    if (wasDrive && !opts.fromSync) await useSync().noteRemoved(id)
  }

  return {
    books,
    progress,
    loaded,
    items,
    continueBook,
    load,
    importFiles,
    addFromDrive,
    setDownloaded,
    verifyDownloads,
    applyMeta,
    markOpened,
    saveProgress,
    applyRemoteProgress,
    markSynced,
    remove,
  }
})
