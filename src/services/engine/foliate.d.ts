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
    getCover?(): Promise<Blob | null>
  }

  export interface FoliateRelocate {
    fraction: number
    cfi: string
    time?: { section: number; total: number }
    section?: { current: number; total: number }
  }

  export interface FoliateRenderer extends HTMLElement {
    setStyles(css: string | [string, string]): void
    next(): Promise<void>
    prev(): Promise<void>
  }

  export function makeBook(file: File | Blob): Promise<FoliateBook>

  export class View extends HTMLElement {
    book: FoliateBook
    renderer: FoliateRenderer
    lastLocation: FoliateRelocate | null
    open(book: FoliateBook | File | Blob): Promise<void>
    init(opts: {
      lastLocation?: string | { fraction: number }
      showTextStart?: boolean
    }): Promise<void>
    resolveNavigation(target: string | number | { fraction: number }): { index: number } | undefined
    goTo(target: string | number): Promise<unknown>
    goToFraction(fraction: number): Promise<void>
    getSectionFractions(): number[]
    next(): Promise<void>
    prev(): Promise<void>
    close(): void
  }
}
