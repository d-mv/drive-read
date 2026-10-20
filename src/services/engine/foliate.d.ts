/** The parts of vendor/foliate-js (untyped JS) that engine/epub.ts uses. Pinned commit: see .gitmodules. */
declare module '@foliate/view.js' {
  import type { RawTocItem } from '@/services/engine/epub-meta'

  export interface FoliateSection {
    size: number
    linear?: string
    id: unknown
  }

  export interface FoliateBook {
    sections: FoliateSection[]
    toc?: RawTocItem[]
    metadata?: {
      title?: string | Record<string, string>
      author?: unknown
      language?: string | string[]
    }
    rendition?: { layout?: string }
    resolveHref(href: string): { index: number } | undefined
    /** A promise for EPUB; FB2 without a cover answers null directly. */
    getCover?(): Promise<Blob | null> | null
  }

  export interface FoliateRelocate {
    fraction: number
    cfi: string
    time?: { section: number; total: number }
    section?: { current: number; total: number }
    /** The visible text of the page. */
    range?: Range
  }

  /** tts.js: one section's text as SSML blocks. Every method answers undefined past the end. */
  export interface FoliateTTS {
    doc: Document
    start(): string | undefined
    resume(): string | undefined
    next(paused?: boolean): string | undefined
    from(range: Range): string | undefined
    setMark(mark: string): void
  }

  export interface FoliateRenderer extends HTMLElement {
    setStyles(css: string | [string, string]): void
    /** The section documents on screen (one in paginated mode). */
    getContents(): { doc: Document; index: number }[]
    next(): Promise<void>
    prev(): Promise<void>
    nextSection(): Promise<void>
    scrollToAnchor(anchor: Range, select?: boolean): Promise<void>
  }

  export function makeBook(file: File | Blob): Promise<FoliateBook>

  export class View extends HTMLElement {
    book: FoliateBook
    renderer: FoliateRenderer
    lastLocation: FoliateRelocate | null
    /** Links, TOC and fraction jumps push entries; page turns replace the current one. */
    history: { back(): void; canGoBack: boolean }
    open(book: FoliateBook | File | Blob): Promise<void>
    init(opts: {
      lastLocation?: string | { fraction: number }
      showTextStart?: boolean
    }): Promise<void>
    resolveNavigation(target: string | number | { fraction: number }): { index: number } | undefined
    goTo(target: string | number): Promise<unknown>
    goToFraction(fraction: number): Promise<void>
    tts: FoliateTTS | null
    /** Text of the section on screen; the default highlight selects the word and turns to it. */
    initTTS(granularity?: 'word' | 'sentence', highlight?: (range: Range) => void): Promise<void>
    getSectionFractions(): number[]
    next(): Promise<void>
    prev(): Promise<void>
    close(): void
  }
}
