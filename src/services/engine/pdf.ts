import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

import { Err, isSome, Ok, type Result } from '@/shared/result'

import './pdf-text-layer.css'
import {
  fractionOf,
  locateFraction,
  outlineToc,
  type PagePosition,
  pinchZoom,
  step,
} from './pdf-layout'
import { chapterAt } from './progress'
import type {
  BookEngine,
  BookMeta,
  Locator,
  OpenError,
  ReaderTheme,
  Relocation,
  Restore,
  SearchSubitem,
  SearchYield,
  TocEntry,
} from './types'

/**
 * PDF engine on pdf.js (architecture doc, "Engines"): pages render to a canvas, fitted to the
 * reading width times the zoom; a page taller than the screen scrolls before the next one turns.
 * A text layer over the canvas makes the text selectable. Pages keep their own colours: dark mode
 * changes only the surround. Loaded as a lazy chunk.
 */

const loadPdfjs = async () => {
  const lib = await import('pdfjs-dist')
  lib.GlobalWorkerOptions.workerSrc = workerUrl
  return lib
}

/** pdf.js data files, served by scripts/pdfjs-assets.ts. */
const PDFJS_DATA = {
  standardFontDataUrl: '/pdfjs/standard_fonts/',
  cMapUrl: '/pdfjs/cmaps/',
  cMapPacked: true,
  iccUrl: '/pdfjs/iccs/',
  wasmUrl: '/pdfjs/wasm/',
}

/** Margins → page width: PDF pages are wider than a text column. */
const PAGE_WIDTH_FACTOR = 1.45
const COVER_WIDTH = 360
const SWIPE_PX = 50
/** iOS Safari draws nothing on a canvas above ~16.7 M pixels: high zoom lowers the resolution. */
const MAX_CANVAS_PIXELS = 16_000_000

type OutlineItem = Awaited<ReturnType<PDFDocumentProxy['getOutline']>>[number]

async function pageIndexOf(doc: PDFDocumentProxy, item: OutlineItem): Promise<number | undefined> {
  try {
    const dest = typeof item.dest === 'string' ? await doc.getDestination(item.dest) : item.dest
    const ref = dest?.[0]
    if (ref === undefined || ref === null) return undefined
    return typeof ref === 'number' ? ref : await doc.getPageIndex(ref)
  } catch {
    return undefined
  }
}

async function renderCover(doc: PDFDocumentProxy): Promise<Blob | undefined> {
  try {
    const page = await doc.getPage(1)
    const base = page.getViewport({ scale: 1 })
    const viewport = page.getViewport({ scale: COVER_WIDTH / base.width })
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(viewport.width)
    canvas.height = Math.round(viewport.height)
    await page.render({ canvas, viewport }).promise
    return await new Promise<Blob | undefined>((r) =>
      canvas.toBlob((b) => r(b ?? undefined), 'image/jpeg', 0.85),
    )
  } catch {
    return undefined
  }
}

export function createPdfEngine(): BookEngine {
  let loading: PDFDocumentLoadingTask | null = null
  let doc: PDFDocumentProxy | null = null
  let toc: TocEntry[] = []
  let at: PagePosition = { page: 0, offset: 0 }
  let maxWidth = 900
  let relocateCb: ((r: Relocation) => void) | undefined

  let pdfjs: Awaited<ReturnType<typeof loadPdfjs>> | null = null
  let scroller: HTMLDivElement | null = null
  /** The page shown: canvas plus text layer. */
  let pageEl: HTMLElement | null = null
  let task: RenderTask | null = null
  let zoom = 1
  let zoomCb: ((zoom: number) => void) | undefined
  let resize: ResizeObserver | null = null
  let lastWidth = 0
  const cleanup: (() => void)[] = []

  async function open(file: File): Promise<Result<BookMeta, OpenError>> {
    try {
      const lib = await loadPdfjs()
      pdfjs = lib
      loading = lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()), ...PDFJS_DATA })
      doc = await loading.promise
    } catch (e) {
      // Encrypted (password) or damaged files land here.
      return Err({ kind: 'unreadable', message: e instanceof Error ? e.message : String(e) })
    }
    const numPages = doc.numPages
    const info = ((await doc.getMetadata().catch(() => null))?.info ?? {}) as {
      Title?: string
      Author?: string
    }
    const outline = (await doc.getOutline().catch(() => null)) ?? []
    const items = await Promise.all(
      outline.map(async (item) => ({
        title: item.title,
        pageIndex: await pageIndexOf(doc!, item),
      })),
    )
    toc = outlineToc(items, numPages)
    return Ok({
      title: info.Title?.trim() ?? '',
      author: info.Author?.trim() ?? '',
      cover: await renderCover(doc),
      toc,
    })
  }

  function emit() {
    if (!doc) return
    const fraction = fractionOf(at, doc.numPages)
    const chapter = chapterAt(
      toc.map((t) => t.start),
      fraction,
    )
    relocateCb?.({
      position: {
        locator: { kind: 'page', page: at.page, offset: at.offset },
        fraction,
        chapterIndex: chapter._tag === 'Some' ? chapter.value.index : 0,
        chapterFraction: chapter._tag === 'Some' ? chapter.value.fraction : 0,
      },
      chapterMinutesLeft: null,
      page: { current: at.page + 1, total: doc.numPages },
    })
  }

  /**
   * Renders page `index` at the fitted width times the zoom, with its text layer, then scrolls to
   * `offset` (0..1) down it, keeping the horizontal position when zoomed.
   */
  async function show(index: number, offset: number) {
    if (!doc || !scroller || !pageEl) return
    const pageIndex = Math.min(doc.numPages - 1, Math.max(0, index))
    task?.cancel()
    const page = await doc.getPage(pageIndex + 1)
    const base = page.getViewport({ scale: 1 })
    const cssWidth = Math.min(scroller.clientWidth, maxWidth) * zoom
    lastWidth = scroller.clientWidth
    const cssViewport = page.getViewport({ scale: cssWidth / base.width })
    const area = cssViewport.width * cssViewport.height
    const dpr = Math.min(window.devicePixelRatio || 1, Math.sqrt(MAX_CANVAS_PIXELS / area))
    const viewport = page.getViewport({ scale: cssViewport.scale * dpr })

    const next = document.createElement('div')
    next.className = 'pdf-page'
    next.style.cssText = `width:${cssViewport.width}px;height:${cssViewport.height}px;--total-scale-factor:${cssViewport.scale}`
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(viewport.width)
    canvas.height = Math.round(viewport.height)
    canvas.style.cssText = 'display:block;width:100%;height:100%'
    canvas.setAttribute('role', 'img')
    canvas.setAttribute('aria-label', `Page ${pageIndex + 1} of ${doc.numPages}`)
    const text = document.createElement('div')
    text.className = 'textLayer'
    next.append(canvas, text)

    task = page.render({ canvas, viewport })
    try {
      await task.promise
    } catch {
      return // cancelled by a newer render
    }
    if (pdfjs)
      await new pdfjs.TextLayer({
        textContentSource: page.streamTextContent(),
        container: text,
        viewport: cssViewport,
      })
        .render()
        .catch(() => {}) // a page without usable text still reads as an image

    const across =
      scroller.scrollWidth > scroller.clientWidth
        ? scroller.scrollLeft / (scroller.scrollWidth - scroller.clientWidth)
        : 0.5
    pageEl.replaceWith(next)
    pageEl = next
    at = { page: pageIndex, offset }
    scroller.scrollTop = offset * Math.max(0, scroller.scrollHeight - scroller.clientHeight)
    scroller.scrollLeft = across * Math.max(0, scroller.scrollWidth - scroller.clientWidth)
    emit()
  }

  async function setZoom(z: number) {
    zoom = z
    await show(at.page, at.offset)
  }

  function onScroll() {
    if (!scroller) return
    const max = scroller.scrollHeight - scroller.clientHeight
    at = { ...at, offset: max > 0 ? scroller.scrollTop / max : 0 }
    emit()
  }

  async function turn(dir: 1 | -1) {
    if (!doc || !scroller) return
    const s = step(
      { top: scroller.scrollTop, viewport: scroller.clientHeight, height: scroller.scrollHeight },
      dir,
    )
    if (s.kind === 'scroll') {
      scroller.scrollTop = s.top
      return
    }
    const target = at.page + dir
    if (target < 0 || target >= doc.numPages) return
    // Going back lands at the bottom of the previous page, as in a paper book.
    await show(target, dir === 1 ? 0 : 1)
  }

  async function mount(el: HTMLElement, restore?: Restore) {
    if (!doc) throw new Error('open() before mount()')
    scroller = document.createElement('div')
    // touch-action: the app handles pinches (zoom); the browser only pans.
    scroller.style.cssText =
      'position:absolute;inset:0;overflow:auto;padding:16px 0;touch-action:pan-x pan-y'
    scroller.tabIndex = -1
    pageEl = document.createElement('div')
    scroller.append(pageEl)
    el.append(scroller)

    const onScrollEvt = () => onScroll()
    scroller.addEventListener('scroll', onScrollEvt, { passive: true })
    // One finger swipes turn pages (at fit; zoomed in, a swipe pans). Two fingers pinch: the
    // page scales with the fingers, then renders sharp at the new zoom.
    let startX = 0
    let pinchFrom = 0
    let ratio = 1
    const gap = (t: TouchList) =>
      Math.hypot(t[0]!.clientX - t[1]!.clientX, t[0]!.clientY - t[1]!.clientY)
    const touchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        pinchFrom = gap(e.touches)
        ratio = 1
      } else startX = e.touches[0]?.clientX ?? 0
    }
    const touchMove = (e: TouchEvent) => {
      if (!pinchFrom || e.touches.length !== 2 || !pageEl) return
      ratio = gap(e.touches) / pinchFrom
      pageEl.style.transform = `scale(${ratio})`
      pageEl.style.transformOrigin = 'center top'
    }
    const touchEnd = (e: TouchEvent) => {
      if (pinchFrom) {
        if (e.touches.length > 0) return
        pinchFrom = 0
        if (pageEl) pageEl.style.transform = ''
        const next = pinchZoom(zoom, ratio)
        if (next !== zoom) {
          void setZoom(next)
          zoomCb?.(next)
        }
        return
      }
      if (zoom > 1) return
      const dx = (e.changedTouches[0]?.clientX ?? startX) - startX
      if (Math.abs(dx) > SWIPE_PX) void turn(dx < 0 ? 1 : -1)
    }
    scroller.addEventListener('touchstart', touchStart, { passive: true })
    scroller.addEventListener('touchmove', touchMove, { passive: true })
    scroller.addEventListener('touchend', touchEnd)
    cleanup.push(() => {
      scroller?.removeEventListener('scroll', onScrollEvt)
      scroller?.removeEventListener('touchstart', touchStart)
      scroller?.removeEventListener('touchmove', touchMove)
      scroller?.removeEventListener('touchend', touchEnd)
    })

    // The observer reports the current size at once: without this, every open rendered twice.
    lastWidth = scroller.clientWidth
    resize = new ResizeObserver(() => {
      if (scroller && Math.abs(scroller.clientWidth - lastWidth) > 1) void show(at.page, at.offset)
    })
    resize.observe(scroller)

    const start =
      restore?.locator.kind === 'page'
        ? { page: restore.locator.page, offset: restore.locator.offset }
        : restore
          ? locateFraction(restore.fraction, doc.numPages)
          : { page: 0, offset: 0 }
    await show(start.page, start.offset)
  }

  async function goTo(loc: Locator) {
    if (loc.kind === 'page') await show(loc.page, loc.offset)
  }

  function setTheme(t: ReaderTheme) {
    const width = Math.round(t.maxInlineSize * PAGE_WIDTH_FACTOR)
    if (width === maxWidth) return
    maxWidth = width
    if (scroller) void show(at.page, at.offset)
  }

  return {
    open,
    mount,
    next: () => turn(1),
    prev: () => turn(-1),
    goTo,
    setTheme,
    onRelocate(cb) {
      relocateCb = cb
    },
    // Keys reach the app directly: there is no frame.
    onKeydown() {},
    setZoom,
    onZoom(cb) {
      zoomCb = cb
    },
    async *search(query: string): AsyncIterable<SearchYield> {
      if (!doc) return
      const q = query.trim().toLowerCase()
      if (!q) return
      const numPages = doc.numPages
      for (let i = 1; i <= numPages; i++) {
        const page = await doc.getPage(i)
        const content = await page.getTextContent()
        const fullText = content.items.map((item) => ('str' in item ? item.str : '')).join(' ')
        const lower = fullText.toLowerCase()
        const subitems: SearchSubitem[] = []
        let idx = lower.indexOf(q)
        while (idx !== -1) {
          const start = Math.max(0, idx - 40)
          const end = Math.min(fullText.length, idx + q.length + 40)
          const excerpt =
            (start > 0 ? '…' : '') +
            fullText.slice(start, end).trim() +
            (end < fullText.length ? '…' : '')
          subitems.push({
            locator: { kind: 'page', page: i - 1, offset: 0 },
            excerpt,
          })
          idx = lower.indexOf(q, idx + q.length || idx + 1)
        }
        yield { progress: i / numPages }
        if (subitems.length > 0) {
          const fraction = (i - 1) / numPages
          const starts = toc.map((t) => t.start)
          const ch = chapterAt(starts, fraction)
          const label = isSome(ch) && toc[ch.value.index] ? toc[ch.value.index]!.label : `Page ${i}`
          yield { label, subitems }
        }
      }
    },
    destroy() {
      task?.cancel()
      resize?.disconnect()
      for (const fn of cleanup.splice(0)) fn()
      scroller?.remove()
      scroller = pageEl = null
      pdfjs = null
      void loading?.destroy()
      loading = null
      doc = null
    },
  }
}
