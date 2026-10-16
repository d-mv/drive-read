import type { Result } from '@/shared/result'

/**
 * One interface for every format, so the reader view and the sync code never branch on format.
 * Architecture doc, "Module structure". Deviations: the `href` locator (TOC targets) and
 * `Relocation` / `onKeydown` (see implementation-notes.md).
 */
export interface BookEngine {
  open(file: File): Promise<Result<BookMeta, OpenError>>
  mount(el: HTMLElement, at?: Restore): Promise<void>
  next(): Promise<void>
  prev(): Promise<void>
  goTo(loc: Locator): Promise<void>
  setTheme(theme: ReaderTheme): void
  onRelocate(cb: (r: Relocation) => void): void
  /** Keys pressed inside the book frame, which do not reach the app document. */
  onKeydown(cb: (e: KeyboardEvent) => void): void
  /** EPUB only: an in-book link (a footnote, a cross-reference) was followed. */
  onLink?(cb: () => void): void
  /** EPUB only: returns to where the reader was before the last followed link. */
  back?(): void
  /** PDF only: zoom relative to the page fitted to the reading width (1 = fit). */
  setZoom?(zoom: number): Promise<void>
  /** PDF only: the zoom changed by a pinch. */
  onZoom?(cb: (zoom: number) => void): void
  /** In-book full text search. */
  search?(query: string): AsyncIterable<SearchYield>
  clearSearch?(): void
  destroy(): void
}

export interface SearchSubitem {
  locator: Locator
  excerpt: string
}

export interface SearchResult {
  label: string
  subitems: SearchSubitem[]
}

export type SearchYield = SearchResult | { progress: number }

export type Locator =
  | { kind: 'cfi'; cfi: string }
  | { kind: 'page'; page: number; offset: number }
  /** A TOC target. Never stored as a reading position. */
  | { kind: 'href'; href: string }

/** Where to reopen a book: the stored locator, with the fraction as a fallback. */
export interface Restore {
  locator: Locator
  fraction: number
}

export interface Position {
  locator: Locator
  /** 0..1 through the book */
  fraction: number
  chapterIndex: number
  /** 0..1 through the chapter */
  chapterFraction: number
}

export interface Relocation {
  position: Position
  /** Estimated minutes left in the current chapter, if known. */
  chapterMinutesLeft: number | null
  /** Fixed-layout formats (PDF): the page shown, 1-based. */
  page?: { current: number; total: number }
}

export interface TocEntry {
  label: string
  locator: Locator
  /** The chapter's starting fraction through the book. */
  start: number
}

export interface BookMeta {
  title: string
  author: string
  cover?: Blob
  toc: TocEntry[]
}

/** A self-hosted face for the book frame, which does not see the app's fonts. */
export interface ReaderFont {
  family: string
  url: string
  style: 'normal' | 'italic'
  weight?: string
  format?: string
  unicodeRange?: string
}

export interface ReaderTheme {
  /** CSS injected into the book frame. */
  css: string
  /** The faces `css` uses; loaded into the frame before `css` applies, so a switch never flashes. */
  fonts: readonly ReaderFont[]
  /** Max width of the text column, px. */
  maxInlineSize: number
}

export type OpenError =
  | { kind: 'unsupported' }
  /** DRM, a broken archive, or anything else the parser rejects. */
  | { kind: 'unreadable'; message: string }
