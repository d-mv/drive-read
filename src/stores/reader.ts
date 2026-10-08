import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { IDLE_MS } from '@/domain/reading'
import { useServices } from '@/services'
import type { DriveError } from '@/services/drive/client'
import { stepZoom } from '@/services/engine/pdf-layout'
import { chapterAt } from '@/services/engine/progress'
import type {
  BookEngine,
  Locator,
  Position,
  ReaderTheme,
  Restore,
  SearchYield,
  TocEntry,
} from '@/services/engine/types'
import { track } from '@/services/events'
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
const positionKey = (l: Locator) =>
  l.kind === 'cfi' ? l.cfi : l.kind === 'page' ? `${l.page}:${Math.round(l.offset * 100)}` : l.href

export const useReader = defineStore('reader', () => {
  const bookId = ref<string | null>(null)
  const status = ref<ReaderStatus>({ kind: 'idle' })
  const position = ref<Position | null>(null)
  const chapterMinutesLeft = ref<number | null>(null)
  const page = ref<{ current: number; total: number } | null>(null)
  const toc = ref<TocEntry[]>([])
  /** PDF zoom, relative to the page fitted to the width; only zoomable engines offer it. */
  const zoom = ref(1)
  const zoomable = ref(false)

  // Not reactive: the engine owns DOM and a custom element.
  let engine: BookEngine | null = null
  let theme: ReaderTheme | null = null
  let session = 0

  /** The reading session being measured (reading.session): from open or the last flush. */
  let measure: {
    format: 'epub' | 'pdf'
    source: 'local' | 'drive'
    started: number
    from: number | null
    to: number
    pages: number
    lastKey?: string
    /** Time spent reading: gaps between page turns, each capped at IDLE_MS. */
    activeMs: number
    lastAt: number
  } | null = null
  let downloadedNow = false

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
    const openStarted = performance.now()
    downloadedNow = false
    const library = useLibrary()
    const { blobs, createEngine } = useServices()
    bookId.value = id
    status.value = { kind: 'loading' }

    if (!library.loaded) await library.load()
    const record = library.books.find((b) => b.id === id)
    if (!record) return failWith('not-found', undefined)
    const fail = (error: ReaderError) => failWith(error, record)

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
      return fail('unreadable')
    }

    engine = next
    toc.value = meta.value.toc
    if (record.provisional) await library.applyMeta(id, meta.value)
    next.onRelocate((r) => {
      let pageChanged = false
      if (measure) {
        // Layout changes (resize, address bar, rotation) report the same position: not a page.
        const key = positionKey(r.position.locator)
        if (measure.from === null) {
          measure.from = r.position.fraction
          measure.lastKey = key
          const savedLoc = library.progress[id]?.locator
          if (savedLoc ? positionKey(savedLoc) !== key : r.position.fraction > 0) {
            pageChanged = true
          }
        } else if (key !== measure.lastKey) {
          measure.pages++
          measure.lastKey = key
          pageChanged = true
        }
        measure.to = r.position.fraction
        const now = Date.now()
        measure.activeMs += Math.min(now - measure.lastAt, IDLE_MS)
        measure.lastAt = now
      }
      position.value = r.position
      chapterMinutesLeft.value = r.chapterMinutesLeft
      page.value = r.page ?? null
      if (pageChanged) void library.saveProgress(id, r.position)
    })
    if (opts.onKeydown) next.onKeydown(opts.onKeydown)
    zoomable.value = !!next.setZoom
    next.onZoom?.((z) => (zoom.value = z))

    const saved = library.progress[id]
    const restore: Restore | undefined = saved
      ? { locator: saved.locator, fraction: saved.fraction }
      : undefined
    measure = {
      format: record.format,
      source: record.source,
      started: Date.now(),
      from: null,
      to: 0,
      pages: 0,
      activeMs: 0,
      lastAt: Date.now(),
    }
    if (theme) next.setTheme(theme)
    await next.mount(el, restore)
    if (mine !== session) return
    await library.markOpened(id)
    status.value = { kind: 'ready' }
    track('book.opened', {
      format: record.format,
      source: record.source,
      ms: performance.now() - openStarted,
      downloaded_now: downloadedNow,
    })
  }

  function startMeasure() {
    const b = book.value
    const at = position.value?.fraction ?? null
    measure = b
      ? {
          format: b.format,
          source: b.source,
          started: Date.now(),
          from: at,
          to: at ?? 0,
          pages: 0,
          activeMs: 0,
          lastAt: Date.now(),
          lastKey: position.value ? positionKey(position.value.locator) : undefined,
        }
      : null
  }

  /**
   * Reports the reading session so far (reading.session) and starts a new one: on close, and
   * when the tab is hidden, since a closed tab never calls close().
   */
  function flushSession() {
    if (measure && measure.from !== null && status.value.kind === 'ready') {
      track('reading.session', {
        format: measure.format,
        source: measure.source,
        minutes:
          Math.round(
            ((measure.activeMs + Math.min(Date.now() - measure.lastAt, IDLE_MS)) / 60_000) * 10,
          ) / 10,
        pages: measure.pages,
        from: Math.round(measure.from * 1000) / 1000,
        to: Math.round(measure.to * 1000) / 1000,
      })
    }
    startMeasure()
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
    const downloadStarted = performance.now()
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
      if (blob.error.kind === 'auth-expired') auth.markExpired('download')
      return DOWNLOAD_ERROR[blob.error.kind]
    }
    const stored = await blobs.put(bookPath(id), blob.value)
    if (isErr(stored)) return stored.error.kind === 'quota' ? 'storage-full' : 'download-failed'
    await library.setDownloaded(id, true)
    downloadedNow = true
    track('book.downloaded', {
      format: record.format,
      bytes: blob.value.size,
      ms: performance.now() - downloadStarted,
    })
    return blobs.get(bookPath(id))
  }

  function failWith(
    error: ReaderError,
    record: { format: 'epub' | 'pdf'; source: 'local' | 'drive' } | undefined,
  ) {
    status.value = { kind: 'error', error }
    track('book.open_failed', {
      reason: error,
      format: record?.format ?? null,
      source: record?.source ?? null,
    })
  }

  function close() {
    flushSession()
    measure = null
    session++
    engine?.clearSearch?.()
    engine?.destroy()
    engine = null
    bookId.value = null
    position.value = null
    chapterMinutesLeft.value = null
    page.value = null
    toc.value = []
    zoom.value = 1
    zoomable.value = false
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

  /** One zoom level in or out, or back to fitting the width (0). */
  async function zoomBy(dir: 1 | -1 | 0) {
    if (!engine?.setZoom) return
    const to = dir === 0 ? 1 : stepZoom(zoom.value, dir)
    zoom.value = to
    await engine.setZoom(to)
  }

  function setTheme(t: ReaderTheme) {
    theme = t
    engine?.setTheme(t)
  }

  async function* search(query: string): AsyncIterable<SearchYield> {
    if (!engine?.search) return
    yield* engine.search(query)
  }

  function clearSearch() {
    engine?.clearSearch?.()
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
    flushSession,
    zoom,
    zoomable,
    zoomBy,
    search,
    clearSearch,
  }
})
