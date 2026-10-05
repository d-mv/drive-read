import type { Locator, TocEntry } from '@/services/engine/types'

/** A book in the library. Key: the Drive file ID, or `local-<sha256>` for a file from this device. */
export interface BookRecord {
  v: 1
  id: string
  source: 'local' | 'drive'
  format: 'epub' | 'pdf'
  fileName: string
  title: string
  author: string
  size: number
  toc: TocEntry[]
  hasCover: boolean
  downloaded: boolean
  addedAt: string
  openedAt: string | null
  /** From Drive metadata; re-matches a book uploaded again under a new id. */
  md5?: string | null
  /** Title and author guessed from the file name until the book is first opened. */
  provisional?: boolean
}

/** Same shape locally and in Drive, minus the local-only `dirty` flag (architecture doc). */
export interface ProgressRecord {
  v: 1
  fileId: string
  locator: Locator
  fraction: number
  updatedAt: string
  device: { id: string; name: string }
  dirty: boolean
  bookmarks: []
  /** The Drive appData file holding this record, once pushed. */
  remoteId?: string
  /** Drive's modifiedTime when this device last pushed or pulled it: detects remote change. */
  remoteModifiedTime?: string
}

export type ReadingStatus = 'unread' | 'reading' | 'finished'
export type LibraryFilter = 'all' | ReadingStatus
export type LibrarySort = 'recent' | 'title' | 'author'
export type CoverTone = 'dark' | 'pale' | 'mid'

/** What the library list needs per book. */
export interface LibraryItem {
  id: string
  title: string
  author: string
  fraction: number | undefined
  /** Last opened, else added. */
  activityAt: string
}

const FINISHED_AT = 0.995

export function readingStatus(fraction: number | undefined): ReadingStatus {
  if (fraction === undefined || fraction <= 0) return 'unread'
  return fraction >= FINISHED_AT ? 'finished' : 'reading'
}

export function formatPercent(fraction: number): string {
  return `${Math.floor(Math.min(1, Math.max(0, fraction)) * 100 + 1e-9)}%`
}

export function titleFromFileName(name: string): string {
  const title = name
    .replace(/\.[^.]+$/, '')
    .replace(/[_.-]+/g, ' ')
    .trim()
  return title || 'Untitled'
}

const TONES: readonly CoverTone[] = ['dark', 'pale', 'mid']

export function coverTone(id: string): CoverTone {
  let h = 0
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return TONES[h % TONES.length]!
}

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()

const collator = new Intl.Collator(undefined, { sensitivity: 'base' })

const SORTS: Record<LibrarySort, (a: LibraryItem, b: LibraryItem) => number> = {
  recent: (a, b) => b.activityAt.localeCompare(a.activityAt),
  title: (a, b) => collator.compare(a.title, b.title),
  author: (a, b) => collator.compare(a.author, b.author) || collator.compare(a.title, b.title),
}

export function selectBooks<T extends LibraryItem>(
  items: readonly T[],
  by: { filter: LibraryFilter; query: string; sort: LibrarySort },
): T[] {
  const q = fold(by.query.trim())
  return items
    .filter((b) => by.filter === 'all' || readingStatus(b.fraction) === by.filter)
    .filter((b) => !q || fold(b.title).includes(q) || fold(b.author).includes(q))
    .sort(SORTS[by.sort])
}

export function filterCounts(items: readonly LibraryItem[]): Record<LibraryFilter, number> {
  const counts = { all: items.length, reading: 0, unread: 0, finished: 0 }
  for (const b of items) counts[readingStatus(b.fraction)]++
  return counts
}

/** The status line on a library card or row. */
export function statusLabel(fraction: number | undefined, downloaded: boolean): string {
  const s = readingStatus(fraction)
  if (s === 'finished') return 'Finished'
  if (s === 'reading') return formatPercent(fraction!)
  return downloaded ? '' : 'Drive only'
}
