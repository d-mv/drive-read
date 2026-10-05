import type { TocEntry } from './types'

/**
 * Pure layout maths for the PDF engine. A PDF position is a page (0-based) plus how far down
 * that page the view is (0..1), since a page fitted to the width can be taller than the screen.
 */

export interface PagePosition {
  page: number
  /** 0..1 down the page */
  offset: number
}

export function fractionOf(at: PagePosition, numPages: number): number {
  return numPages > 0 ? Math.min(1, (at.page + at.offset) / numPages) : 0
}

export function locateFraction(fraction: number, numPages: number): PagePosition {
  if (numPages <= 0) return { page: 0, offset: 0 }
  const x = Math.min(1, Math.max(0, fraction)) * numPages
  const page = Math.min(numPages - 1, Math.floor(x))
  return { page, offset: x - page }
}

/** Outline items with their resolved page; unresolved ones are dropped. */
export function outlineToc(
  items: readonly { title: string; pageIndex: number | undefined }[],
  numPages: number,
): TocEntry[] {
  return items.flatMap((i) =>
    i.pageIndex === undefined
      ? []
      : [
          {
            label: i.title.trim(),
            locator: { kind: 'page' as const, page: i.pageIndex, offset: 0 },
            start: i.pageIndex / numPages,
          },
        ],
  )
}

/** Share of the viewport one step scrolls, keeping a few lines of overlap. */
const STEP = 0.9

/** Next/previous: scroll within a tall page first, then turn the page. */
export function step(
  view: { top: number; viewport: number; height: number },
  dir: 1 | -1,
): { kind: 'scroll'; top: number } | { kind: 'page' } {
  const max = Math.max(0, view.height - view.viewport)
  if (dir === 1) {
    return view.top < max - 1
      ? { kind: 'scroll', top: Math.min(max, view.top + view.viewport * STEP) }
      : { kind: 'page' }
  }
  return view.top > 1
    ? { kind: 'scroll', top: Math.max(0, view.top - view.viewport * STEP) }
    : { kind: 'page' }
}

/** Zoom relative to the page fitted to the reading width (1 = fit). */
export const ZOOM_LEVELS: readonly number[] = [1, 1.25, 1.5, 2, 2.5, 3]
const MIN_ZOOM = ZOOM_LEVELS[0]!
const MAX_ZOOM = ZOOM_LEVELS[ZOOM_LEVELS.length - 1]!
const EPS = 1e-9

/** The next level in `dir` from `zoom` (which may sit between levels after a pinch). */
export function stepZoom(zoom: number, dir: 1 | -1): number {
  return dir === 1
    ? (ZOOM_LEVELS.find((l) => l > zoom + EPS) ?? MAX_ZOOM)
    : (ZOOM_LEVELS.findLast((l) => l < zoom - EPS) ?? MIN_ZOOM)
}

/** The zoom after a pinch that scaled the page by `ratio`, within range and rounded to 5%. */
export function pinchZoom(zoom: number, ratio: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(zoom * ratio * 20) / 20))
}
