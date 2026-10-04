import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { useServices } from '@/services'
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
import { isErr, isNone, toNullable } from '@/shared/result'

import { useLibrary } from './library'

export type ReaderError = 'not-found' | 'missing-file' | 'unreadable'
export type ReaderStatus =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready' }
  | { kind: 'error'; error: ReaderError }

/** The open book: engine lifecycle, position, and navigation. */
export const useReader = defineStore('reader', () => {
  const bookId = ref<string | null>(null)
  const status = ref<ReaderStatus>({ kind: 'idle' })
  const position = ref<Position | null>(null)
  const chapterMinutesLeft = ref<number | null>(null)
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

    const file = await blobs.get(bookPath(id))
    if (mine !== session) return
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
    next.onRelocate((r) => {
      position.value = r.position
      chapterMinutesLeft.value = r.chapterMinutesLeft
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
