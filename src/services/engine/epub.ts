import type { FoliateBook, FoliateRelocate, View } from '@foliate/view.js'

import { Err, Ok, type Result } from '@/shared/result'

import { formatAuthors, formatLanguageMap, tocEntries } from './epub-meta'
import { externalUrl } from './links'
import { chapterAt, normalizeStarts, sectionStarts } from './progress'
import { foliateFile } from './sniff'
import type {
  BookEngine,
  BookMeta,
  Locator,
  OpenError,
  ReaderFont,
  ReaderTheme,
  Relocation,
  Restore,
  SearchYield,
} from './types'

/**
 * EPUB engine on foliate-js. The only file that imports it: its README says the API is not
 * stable, so a vendor update should only ever touch this adapter.
 */

/** Bytes of text per minute of reading, as foliate-js's SectionProgress uses. */
const SIZE_PER_MINUTE = 1600

const loadFoliate = () => import('@foliate/view.js')

export function createEpubEngine(format: 'epub' | 'fb2' = 'epub'): BookEngine {
  let book: FoliateBook | null = null
  let view: View | null = null
  let starts: number[] = []
  let relocateCb: ((r: Relocation) => void) | undefined
  let keydownCb: ((e: KeyboardEvent) => void) | undefined
  let linkCb: (() => void) | undefined
  let theme: ReaderTheme | null = null
  const registered = new WeakMap<Document, Map<string, FontFace>>()

  /**
   * FontFace objects belong to one document and every section is a new frame document, so each
   * face is registered once per document. A typeface switch then only changes the CSS, instead of
   * re-parsing megabytes of inline @font-face data.
   */
  function registerFonts(doc: Document, fonts: readonly ReaderFont[]): FontFace[] {
    let faces = registered.get(doc)
    if (!faces) registered.set(doc, (faces = new Map()))
    const Face = (doc.defaultView as (Window & typeof globalThis) | null)?.FontFace ?? FontFace
    return fonts.map((f) => {
      const key = `${f.family}|${f.style}|${f.weight ?? ''}|${f.unicodeRange ?? ''}`
      let face = faces.get(key)
      if (!face) {
        face = new Face(f.family, `url("${f.url}") format('${f.format ?? 'woff2'}')`, {
          style: f.style,
          weight: f.weight ?? '200 900',
          unicodeRange: f.unicodeRange ?? 'U+0-10FFFF',
          // Data URLs load at once: block hides the fallback for that moment instead of flashing it.
          display: 'block',
        })
        doc.fonts.add(face)
        faces.set(key, face)
      }
      return face
    })
  }

  async function open(file: File): Promise<Result<BookMeta, OpenError>> {
    // Anything foliate-js throws, while loading or while reading metadata, means unreadable.
    try {
      const { makeBook } = await loadFoliate()
      const opened = await makeBook(await foliateFile(file, format))
      book = opened
      const lang = [opened.metadata?.language].flat()[0]
      starts = sectionStarts(opened.sections)
      const toc = tocEntries(opened.toc ?? [], starts, (href) => opened.resolveHref(href)?.index)
      // EPUB answers with a promise; FB2 without a cover answers null at once.
      const cover = (await Promise.resolve(opened.getCover?.()).catch(() => null)) ?? undefined
      return Ok({
        title: formatLanguageMap(opened.metadata?.title, lang),
        author: formatAuthors(opened.metadata?.author as Parameters<typeof formatAuthors>[0], lang),
        cover,
        toc,
      })
    } catch (e) {
      return Err({ kind: 'unreadable', message: e instanceof Error ? e.message : String(e) })
    }
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

  async function applyTheme() {
    if (!view?.renderer || !theme) return
    const t = theme
    // Load the body-text faces before the CSS names them, so a switch is one reflow with no
    // fallback flash. Bold and italic load when the text uses them.
    const faces = view.renderer.getContents().flatMap(({ doc }) => registerFonts(doc, t.fonts))
    const body = faces.filter((f) => f.style === 'normal' && f.weight !== '700')
    await Promise.all(body.map((f) => f.load().catch(() => undefined)))
    if (t !== theme || !view?.renderer) return
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
      // Fires before the section is laid out, so the faces are there for the first layout.
      registerFonts(doc, theme?.fonts ?? [])
    })
    view.addEventListener('link', () => linkCb?.())
    // foliate would window.open() any scheme and leave the new page a handle on this tab.
    view.addEventListener('external-link', (e) => {
      e.preventDefault()
      const url = externalUrl((e as CustomEvent<{ href_: string }>).detail.href_)
      if (url) window.open(url, '_blank', 'noopener,noreferrer')
    })
    await view.open(book)
    view.renderer.setAttribute('flow', 'paginated')
    await applyTheme()

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
      void applyTheme()
    },
    onRelocate(cb) {
      relocateCb = cb
    },
    onKeydown(cb) {
      keydownCb = cb
    },
    onLink(cb) {
      linkCb = cb
    },
    back() {
      view?.history.back()
    },
    async *search(query: string): AsyncIterable<SearchYield> {
      if (!view) return
      const q = query.trim()
      if (!q) return
      const searchIter = (
        view as unknown as { search(opts: { query: string }): AsyncIterable<unknown> }
      ).search({ query: q })
      for await (const res of searchIter) {
        if (res === 'done') break
        if (typeof res === 'object' && res !== null) {
          if ('subitems' in res && Array.isArray(res.subitems)) {
            yield {
              label: (res as { label?: string }).label || '',
              subitems: (res.subitems as { cfi: string; excerpt: string }[]).map((s) => ({
                locator: { kind: 'cfi' as const, cfi: s.cfi },
                excerpt: s.excerpt,
              })),
            }
          } else if (
            'progress' in res &&
            typeof (res as { progress: number }).progress === 'number'
          ) {
            yield { progress: (res as { progress: number }).progress }
          }
        }
      }
    },
    clearSearch() {
      ;(view as unknown as { clearSearch?(): void })?.clearSearch?.()
    },
    readAloud() {
      /** tts.js works on one section; past its end, read on in the next one that has text. */
      async function nextSection(): Promise<string | null> {
        for (;;) {
          if (!view) return null
          const before = view.renderer.getContents()[0]?.index
          await view.renderer.nextSection()
          if (!view || view.renderer.getContents()[0]?.index === before) return null
          await view.initTTS('word')
          const first = view.tts?.start()
          if (first !== undefined) return first
        }
      }
      let swipeCb: (() => void) | undefined
      // A swipe turns the page inside foliate's paginator, reported as a 'snap'.
      view?.renderer.addEventListener('relocate', (e) => {
        if ((e as CustomEvent<{ reason?: string }>).detail.reason === 'snap') swipeCb?.()
      })
      return {
        onSwipe(cb) {
          swipeCb = cb
        },
        async start() {
          if (!view) return null
          await view.initTTS('word')
          const range = view.lastLocation?.range
          let first: string | undefined
          try {
            first = range ? view.tts?.from(range) : view.tts?.start()
          } catch {
            // The page's range belongs to a section no longer shown: read the section from its start.
            first = view.tts?.start()
          }
          return first ?? nextSection()
        },
        async next() {
          return view?.tts?.next() ?? nextSection()
        },
        async resume() {
          return view?.tts?.resume() ?? null
        },
        mark(name) {
          view?.tts?.setMark(name)
        },
        stop() {
          for (const { doc } of view?.renderer.getContents() ?? [])
            doc.getSelection()?.removeAllRanges()
        },
      }
    },
    destroy() {
      view?.close()
      view?.remove()
      view = null
      book = null
    },
  }
}
