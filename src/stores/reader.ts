import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { useServices } from '@/services'
import type { DriveError } from '@/services/drive/client'
import { chapterAt } from '@/services/engine/progress'
import type {
  BookEngine,
  Locator,
  Position,
  ReaderTheme,
  Restore,
  TocEntry,
} from '@/services/engine/types'
import { logger } from '@/services/logger'
import { bookPath } from '@/services/storage/blobs'
import { isErr, isNone, type Option, toNullable } from '@/shared/result'

import { useAuth } from './auth'
import { useLibrary } from './library'

export type ReaderError =
  | 'not-found'
  | 'missing-file'
  | 'unreadable'
  /** Drive book, not on this device, and no valid token. */
  | 'reconnect'
  | 'offline'
  | 'missing-in-drive'
  | 'download-failed'
  | 'storage-full'
export type ReaderStatus =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'downloading'; fraction: number }
  | { kind: 'ready' }
  | { kind: 'error'; error: ReaderError }

const DOWNLOAD_ERROR: Record<DriveError['kind'], ReaderError> = {
  'auth-expired': 'reconnect',
  offline: 'offline',
  'not-found': 'missing-in-drive',
  forbidden: 'missing-in-drive',
  'rate-limited': 'download-failed',
  http: 'download-failed',
}

/** The open book: engine lifecycle, position, and navigation. */
export const useReader = defineStore('reader', () => {
  const bookId = ref<string | null>(null)
  const status = ref<ReaderStatus>({ kind: 'idle' })
  const position = ref<Position | null>(null)
  const chapterMinutesLeft = ref<number | null>(null)
  const page = ref<{ current: number; total: number } | null>(null)
  const toc = ref<TocEntry[]>([])

  // Not reactive: the engine owns DOM and a custom element.
  let engine: BookEngine | null = null
  let theme: ReaderTheme | null = null
  let session = 0

  const book = computed(() => useLibrary().books.find((b) => b.id === bookId.value))
  const chapter = computed(() =>
    position.value && toc.value.length > 0
      ? toNullable(
          chapterAt(
            toc.value.map((t) => t.start),
            position.value.fraction,
          ),
        )
      : null,
  )

  async function open(
    id: string,
    el: HTMLElement,
    opts: { onKeydown?: (e: KeyboardEvent) => void } = {},
  ) {
    close()
    const mine = ++session
    const library = useLibrary()
    const { blobs, createEngine } = useServices()
    bookId.value = id
    status.value = { kind: 'loading' }

    if (!library.loaded) await library.load()
    const record = library.books.find((b) => b.id === id)
    if (!record) return fail('not-found')

    let file = await blobs.get(bookPath(id))
    if (mine !== session) return
    if (isNone(file) && record.source === 'drive') {
      // Never downloaded, or evicted by the browser: fetch it from Drive (book pipeline step 3).
      if (record.downloaded) await library.setDownloaded(id, false)
      const fetched = await download(id, mine)
      if (fetched === 'stale') return
      if (typeof fetched === 'string') return fail(fetched)
      file = fetched
    }
    if (isNone(file)) return fail('missing-file')

    const next = createEngine(record.format)
    const meta = await next.open(file.value)
    if (mine !== session) return next.destroy()
    if (isErr(meta)) {
      next.destroy()
      logger.warn('book failed to open', { reason: meta.error.kind })
      return fail('unreadable')
    }

    engine = next
    toc.value = meta.value.toc
    if (record.provisional) await library.applyMeta(id, meta.value)
    next.onRelocate((r) => {
      position.value = r.position
      chapterMinutesLeft.value = r.chapterMinutesLeft
      page.value = r.page ?? null
      void library.saveProgress(id, r.position)
    })
    if (opts.onKeydown) next.onKeydown(opts.onKeydown)

    const saved = library.progress[id]
    const restore: Restore | undefined = saved
      ? { locator: saved.locator, fraction: saved.fraction }
      : undefined
    await next.mount(el, restore)
    if (mine !== session) return
    if (theme) next.setTheme(theme)
    await library.markOpened(id)
    status.value = { kind: 'ready' }
  }

  /** Downloads a Drive book into OPFS. Returns the stored file, an error, or 'stale'. */
  async function download(id: string, mine: number): Promise<Option<File> | ReaderError | 'stale'> {
    const library = useLibrary()
    const auth = useAuth()
    const { drive, blobs } = useServices()
    const record = library.books.find((b) => b.id === id)!
    const token = auth.validToken()
    if (isNone(token)) return 'reconnect'

    status.value = { kind: 'downloading', fraction: 0 }
    const blob = await drive.download(
      token.value,
      {
        id,
        mimeType: record.format === 'pdf' ? 'application/pdf' : 'application/epub+zip',
        size: record.size,
      },
      (fraction) => {
        if (mine === session) status.value = { kind: 'downloading', fraction }
      },
    )
    if (mine !== session) return 'stale'
    if (isErr(blob)) {
      if (blob.error.kind === 'auth-expired') auth.markExpired()
      logger.warn('book download failed', { reason: blob.error.kind })
      return DOWNLOAD_ERROR[blob.error.kind]
    }
    const stored = await blobs.put(bookPath(id), blob.value)
    if (isErr(stored)) return stored.error.kind === 'quota' ? 'storage-full' : 'download-failed'
    await library.setDownloaded(id, true)
    logger.info('book downloaded', { size: blob.value.size })
    return blobs.get(bookPath(id))
  }

  function fail(error: ReaderError) {
    status.value = { kind: 'error', error }
  }

  function close() {
    session++
    engine?.destroy()
    engine = null
    bookId.value = null
    position.value = null
    chapterMinutesLeft.value = null
    page.value = null
    toc.value = []
    status.value = { kind: 'idle' }
  }

  const next = async () => {
    await engine?.next()
  }
  const prev = async () => {
    await engine?.prev()
  }
  const goTo = async (loc: Locator) => {
    await engine?.goTo(loc)
  }

  function setTheme(t: ReaderTheme) {
    theme = t
    engine?.setTheme(t)
  }

  return {
    bookId,
    status,
    position,
    chapterMinutesLeft,
    page,
    toc,
    book,
    chapter,
    open,
    close,
    next,
    prev,
    goTo,
    setTheme,
  }
})
