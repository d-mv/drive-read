import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

import { Err, Ok, type Result } from '@/shared/result'

import { fractionOf, locateFraction, outlineToc, type PagePosition, step } from './pdf-layout'
import { chapterAt } from './progress'
import type {
  BookEngine,
  BookMeta,
  Locator,
  OpenError,
  ReaderTheme,
  Relocation,
  Restore,
  TocEntry,
} from './types'

/**
 * PDF engine on pdf.js (architecture doc, "Engines"): pages render to a canvas, fitted to the
 * reading width; a page taller than the screen scrolls before the next one turns. Pages keep
 * their own colours: dark mode changes only the surround. Loaded as a lazy chunk.
 */

const loadPdfjs = async () => {
  const lib = await import('pdfjs-dist')
  lib.GlobalWorkerOptions.workerSrc = workerUrl
  return lib
}

/** Margins → page width: PDF pages are wider than a text column. */
const PAGE_WIDTH_FACTOR = 1.45
const COVER_WIDTH = 360
const SWIPE_PX = 50

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

  let scroller: HTMLDivElement | null = null
  let canvas: HTMLCanvasElement | null = null
  let task: RenderTask | null = null
  let resize: ResizeObserver | null = null
  let lastWidth = 0
  const cleanup: (() => void)[] = []

  async function open(file: File): Promise<Result<BookMeta, OpenError>> {
    try {
      const lib = await loadPdfjs()
      loading = lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) })
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

  /** Renders page `index` fitted to the width, then scrolls to `offset` (0..1) of it. */
  async function show(index: number, offset: number) {
    if (!doc || !scroller || !canvas) return
    const pageIndex = Math.min(doc.numPages - 1, Math.max(0, index))
    task?.cancel()
    const page = await doc.getPage(pageIndex + 1)
    const base = page.getViewport({ scale: 1 })
    const cssWidth = Math.min(scroller.clientWidth, maxWidth)
    lastWidth = scroller.clientWidth
    const dpr = window.devicePixelRatio || 1
    const viewport = page.getViewport({ scale: (cssWidth / base.width) * dpr })
    const next = document.createElement('canvas')
    next.width = Math.round(viewport.width)
    next.height = Math.round(viewport.height)
    next.style.cssText = `display:block;margin:0 auto;width:${cssWidth}px;height:${viewport.height / dpr}px;background:#fff`
    next.setAttribute('role', 'img')
    next.setAttribute('aria-label', `Page ${pageIndex + 1} of ${doc.numPages}`)
    task = page.render({ canvas: next, viewport })
    try {
      await task.promise
    } catch {
      return // cancelled by a newer render
    }
    canvas.replaceWith(next)
    canvas = next
    at = { page: pageIndex, offset }
    scroller.scrollTop = offset * Math.max(0, scroller.scrollHeight - scroller.clientHeight)
    emit()
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
    scroller.style.cssText =
      'position:absolute;inset:0;overflow-y:auto;overflow-x:hidden;padding:16px 0'
    scroller.tabIndex = -1
    canvas = document.createElement('canvas')
    scroller.append(canvas)
    el.append(scroller)

    const onScrollEvt = () => onScroll()
    scroller.addEventListener('scroll', onScrollEvt, { passive: true })
    let startX = 0
    const touchStart = (e: TouchEvent) => (startX = e.touches[0]?.clientX ?? 0)
    const touchEnd = (e: TouchEvent) => {
      const dx = (e.changedTouches[0]?.clientX ?? startX) - startX
      if (Math.abs(dx) > SWIPE_PX) void turn(dx < 0 ? 1 : -1)
    }
    scroller.addEventListener('touchstart', touchStart, { passive: true })
    scroller.addEventListener('touchend', touchEnd)
    cleanup.push(() => {
      scroller?.removeEventListener('scroll', onScrollEvt)
      scroller?.removeEventListener('touchstart', touchStart)
      scroller?.removeEventListener('touchend', touchEnd)
    })

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
    destroy() {
      task?.cancel()
      resize?.disconnect()
      for (const fn of cleanup.splice(0)) fn()
      scroller?.remove()
      scroller = canvas = null
      void loading?.destroy()
      loading = null
      doc = null
    },
  }
}
