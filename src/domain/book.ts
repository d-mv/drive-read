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
  /** Drive no longer lists the file (deleted, trashed or access lost); the local copy still opens. */
  missingInDrive?: boolean
  /** The file changed in Drive after it was downloaded: the newer version, offered on open. */
  driveVersion?: { md5: string; size: number }
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
/** 'downloaded': Drive books stored on this device, whose file can be removed to free space. */
export type LibraryFilter = 'all' | ReadingStatus | 'downloaded'
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
  /** Size of a Drive book's file on this device; null when not downloaded or a local book. */
  downloadBytes: number | null
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
  const keep = (b: T) =>
    by.filter === 'all' ||
    (by.filter === 'downloaded'
      ? b.downloadBytes !== null
      : readingStatus(b.fraction) === by.filter)
  // Freeing space: the largest files first.
  const order =
    by.filter === 'downloaded'
      ? (a: T, b: T) => b.downloadBytes! - a.downloadBytes!
      : SORTS[by.sort]
  return items
    .filter(keep)
    .filter((b) => !q || fold(b.title).includes(q) || fold(b.author).includes(q))
    .sort(order)
}

export function filterCounts(items: readonly LibraryItem[]): Record<LibraryFilter, number> {
  const counts = { all: items.length, reading: 0, unread: 0, finished: 0, downloaded: 0 }
  for (const b of items) {
    counts[readingStatus(b.fraction)]++
    if (b.downloadBytes !== null) counts.downloaded++
  }
  return counts
}

/** The status line on a library card or row. */
export function statusLabel(
  fraction: number | undefined,
  downloaded: boolean,
  online = true,
  drive: { missingInDrive?: boolean; newVersion?: boolean } = {},
): string {
  if (drive.missingInDrive) return 'Missing in Drive'
  if (drive.newVersion) return 'New version'
  const s = readingStatus(fraction)
  if (s === 'finished') return 'Finished'
  if (s === 'reading') return formatPercent(fraction!)
  if (downloaded) return ''
  return online ? 'Drive only' : 'Not downloaded'
}
