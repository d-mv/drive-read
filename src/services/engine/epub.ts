import type { FoliateBook, FoliateRelocate, View } from '@foliate/view.js'

import { Err, Ok, type Result } from '@/shared/result'

import { formatAuthors, formatLanguageMap, tocEntries } from './epub-meta'
import { chapterAt, normalizeStarts, sectionStarts } from './progress'
import type {
  BookEngine,
  BookMeta,
  Locator,
  OpenError,
  ReaderTheme,
  Relocation,
  Restore,
} from './types'

/**
 * EPUB engine on foliate-js. The only file that imports it: its README says the API is not
 * stable, so a vendor update should only ever touch this adapter.
 */

/** Bytes of text per minute of reading, as foliate-js's SectionProgress uses. */
const SIZE_PER_MINUTE = 1600

const loadFoliate = () => import('@foliate/view.js')

export function createEpubEngine(): BookEngine {
  let book: FoliateBook | null = null
  let view: View | null = null
  let starts: number[] = []
  let relocateCb: ((r: Relocation) => void) | undefined
  let keydownCb: ((e: KeyboardEvent) => void) | undefined
  let theme: ReaderTheme | null = null

  async function open(file: File): Promise<Result<BookMeta, OpenError>> {
    try {
      const { makeBook } = await loadFoliate()
      book = await makeBook(file)
    } catch (e) {
      return Err({ kind: 'unreadable', message: e instanceof Error ? e.message : String(e) })
    }
    const lang = [book.metadata?.language].flat()[0]
    starts = sectionStarts(book.sections)
    const toc = tocEntries(book.toc ?? [], starts, (href) => book!.resolveHref(href)?.index)
    const cover = (await book.getCover?.().catch(() => null)) ?? undefined
    return Ok({
      title: formatLanguageMap(book.metadata?.title, lang),
      author: formatAuthors(book.metadata?.author as Parameters<typeof formatAuthors>[0], lang),
      cover,
      toc,
    })
  }

  function toRelocation(d: FoliateRelocate): Relocation {
    const chapterStarts = book ? tocStarts() : []
    const chapter = chapterAt(chapterStarts, d.fraction)
    const chapterIndex = chapter._tag === 'Some' ? chapter.value.index : 0
    const chapterFraction = chapter._tag === 'Some' ? chapter.value.fraction : 0
    return {
      position: {
        locator: { kind: 'cfi', cfi: d.cfi },
        fraction: d.fraction,
        chapterIndex,
        chapterFraction,
      },
      chapterMinutesLeft: chapterMinutes(chapterStarts, chapterIndex, chapterFraction),
    }
  }

  function tocStarts(): number[] {
    return tocEntries(book!.toc ?? [], starts, (href) => book!.resolveHref(href)?.index).map(
      (t) => t.start,
    )
  }

  function chapterMinutes(chapterStarts: number[], index: number, fraction: number): number | null {
    if (!book || chapterStarts.length === 0) return null
    const total = book.sections.reduce((a, s) => a + (s.linear !== 'no' ? s.size : 0), 0)
    const sorted = normalizeStarts(chapterStarts)
    const length = ((sorted[index + 1] ?? 1) - (sorted[index] ?? 0)) * total
    return Math.max(0, Math.round(((1 - fraction) * length) / SIZE_PER_MINUTE))
  }

  function applyTheme() {
    if (!view?.renderer || !theme) return
    view.renderer.setAttribute('max-inline-size', `${theme.maxInlineSize}px`)
    view.renderer.setAttribute('gap', '6%')
    view.renderer.setAttribute('margin', '32px')
    // One centred column, as on the design canvas (foliate defaults to two-page spreads).
    view.renderer.setAttribute('max-column-count', '1')
    view.renderer.setStyles(theme.css)
  }

  async function mount(el: HTMLElement, at?: Restore) {
    if (!book) throw new Error('open() before mount()')
    await loadFoliate()
    view = document.createElement('foliate-view') as View
    view.style.cssText = 'display:block;width:100%;height:100%'
    el.append(view)
    view.addEventListener('relocate', (e) =>
      relocateCb?.(toRelocation((e as CustomEvent<FoliateRelocate>).detail)),
    )
    view.addEventListener('load', (e) => {
      const { doc } = (e as CustomEvent<{ doc: Document }>).detail
      doc.addEventListener('keydown', (ev) => keydownCb?.(ev))
    })
    await view.open(book)
    view.renderer.setAttribute('flow', 'paginated')
    applyTheme()

    const cfi = at?.locator.kind === 'cfi' ? at.locator.cfi : undefined
    // A CFI that no longer resolves (file replaced) falls back to the fraction.
    if (cfi && view.resolveNavigation(cfi)) await view.init({ lastLocation: cfi })
    else if (at && at.fraction > 0) await view.init({ lastLocation: { fraction: at.fraction } })
    else await view.init({ showTextStart: true })
  }

  async function goTo(loc: Locator) {
    if (!view) return
    if (loc.kind === 'cfi') await view.goTo(loc.cfi)
    else if (loc.kind === 'href') await view.goTo(loc.href)
  }

  return {
    open,
    mount,
    next: async () => {
      await view?.next()
    },
    prev: async () => {
      await view?.prev()
    },
    goTo,
    setTheme(t) {
      theme = t
      applyTheme()
    },
    onRelocate(cb) {
      relocateCb = cb
    },
    onKeydown(cb) {
      keydownCb = cb
    },
    destroy() {
      view?.close()
      view?.remove()
      view = null
      book = null
    },
  }
}
