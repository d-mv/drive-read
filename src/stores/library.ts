import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import {
  type BookRecord,
  type LibraryItem,
  type ProgressRecord,
  readingStatus,
  titleFromFileName,
} from '@/domain/book'
import { useServices } from '@/services'
import type { Position } from '@/services/engine/types'
import { logger } from '@/services/logger'
import { bookPath, coverPath } from '@/services/storage/blobs'
import { isErr } from '@/shared/result'

export type ImportFailure = 'unsupported' | 'unreadable' | 'quota' | 'storage'

export interface ImportResult {
  /** Added books, and books already in the library that the same bytes matched. */
  added: BookRecord[]
  failed: { name: string; reason: ImportFailure }[]
}

export type LibraryEntry = LibraryItem & { book: BookRecord }

const isEpub = (f: File) => f.type === 'application/epub+zip' || /\.epub$/i.test(f.name)

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

  /** The most recently opened book that is started but not finished. */
  const continueBook = computed(
    () =>
      books.value
        .filter((b) => b.openedAt && readingStatus(progress.value[b.id]?.fraction) === 'reading')
        .sort((a, b) => b.openedAt!.localeCompare(a.openedAt!))[0],
  )

  async function load() {
    const { db } = useServices()
    const [allBooks, allProgress] = await Promise.all([db.allBooks(), db.allProgress()])
    books.value = allBooks
    progress.value = Object.fromEntries(allProgress.map((p) => [p.fileId, p]))
    loaded.value = true
  }

  async function importOne(file: File): Promise<BookRecord | ImportFailure> {
    const { db, blobs, createEngine, bookId, now } = useServices()
    if (!isEpub(file)) return 'unsupported'

    const id = await bookId(file)
    const existing = books.value.find((b) => b.id === id)
    if (existing) return existing

    const engine = createEngine('epub')
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
      format: 'epub',
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
      logger.info(typeof r === 'string' ? 'import failed' : 'book imported', {
        reason: typeof r === 'string' ? r : null,
        size: file.size,
      })
    }
    // Ask once, after the first book is stored, so the browser keeps our data.
    if (result.added.length > 0) void navigator.storage?.persist?.()
    return result
  }

  async function markOpened(id: string) {
    const { db, now } = useServices()
    const book = books.value.find((b) => b.id === id)
    if (!book) return
    book.openedAt = now().toISOString()
    await db.putBook({ ...book })
  }

  /** Written on every page turn. `dirty` marks it for the sync queue (build step 5). */
  async function saveProgress(id: string, position: Position) {
    const { db, now, device } = useServices()
    const record: ProgressRecord = {
      v: 1,
      fileId: id,
      locator: position.locator,
      fraction: position.fraction,
      updatedAt: now().toISOString(),
      device: { ...device },
      dirty: true,
      bookmarks: [],
    }
    progress.value[id] = record
    const saved = await db.putProgress(record)
    if (isErr(saved)) logger.warn('progress not saved', { reason: saved.error.kind })
  }

  async function remove(id: string) {
    const { db, blobs } = useServices()
    await Promise.all([blobs.remove(bookPath(id)), blobs.remove(coverPath(id)), db.deleteBook(id)])
    books.value = books.value.filter((b) => b.id !== id)
    delete progress.value[id]
  }

  return {
    books,
    progress,
    loaded,
    items,
    continueBook,
    load,
    importFiles,
    markOpened,
    saveProgress,
    remove,
  }
})
