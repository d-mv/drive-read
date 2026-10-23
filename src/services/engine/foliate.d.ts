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

/** zip.js as vendored by foliate-js: only what engine/zip.ts uses. */
declare module '@foliate/vendor/zip.js' {
  export function configure(options: { useWebWorkers?: boolean }): void
  export class BlobReader {
    constructor(blob: Blob)
  }
  export class TextWriter {
    private readonly text: true
    constructor(encoding?: string)
  }
  export class BlobWriter {
    private readonly blob: true
    constructor(mimeType?: string)
  }
  export interface ZipEntry {
    filename: string
    /** As the archive declares it; zip.js refuses data that inflates past it. */
    uncompressedSize: number
    getData(writer: TextWriter): Promise<string>
    getData(writer: BlobWriter): Promise<Blob>
  }
  export class ZipReader {
    constructor(reader: BlobReader)
    getEntries(): Promise<ZipEntry[]>
  }
}

/** foliate-js's EPUB reader, given a loader (engine/zip.ts). */
declare module '@foliate/epub.js' {
  import type { FoliateBook } from '@foliate/view.js'
  import type { ZipLoader } from '@/services/engine/zip'

  export class EPUB {
    constructor(loader: ZipLoader)
    init(): Promise<FoliateBook>
  }
}

/** foliate-js's FB2 reader, given the XML. */
declare module '@foliate/fb2.js' {
  import type { FoliateBook } from '@foliate/view.js'

  export function makeFB2(xml: Blob): Promise<FoliateBook>
}
