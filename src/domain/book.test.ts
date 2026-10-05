import { describe, expect, it } from 'vitest'

import {
  type LibraryItem,
  coverTone,
  filterCounts,
  formatPercent,
  readingStatus,
  selectBooks,
  statusLabel,
  titleFromFileName,
} from './book'

describe('readingStatus', () => {
  it('is unread without progress or at the very start', () => {
    expect(readingStatus(undefined)).toBe('unread')
    expect(readingStatus(0)).toBe('unread')
  })

  it('is reading in between', () => {
    expect(readingStatus(0.001)).toBe('reading')
    expect(readingStatus(0.98)).toBe('reading')
  })

  it('is finished on the last page', () => {
    expect(readingStatus(0.995)).toBe('finished')
    expect(readingStatus(1)).toBe('finished')
  })
})

describe('formatPercent', () => {
  it('rounds down so 99.6% never shows as 100%', () => {
    expect(formatPercent(0.42)).toBe('42%')
    expect(formatPercent(0.996)).toBe('99%')
    expect(formatPercent(1)).toBe('100%')
    expect(formatPercent(0)).toBe('0%')
  })
})

describe('titleFromFileName', () => {
  it('strips the extension and turns separators into spaces', () => {
    expect(titleFromFileName('moby_dick-herman.melville.epub')).toBe('moby dick herman melville')
    expect(titleFromFileName('Walden.EPUB')).toBe('Walden')
  })

  it('falls back for an empty name', () => {
    expect(titleFromFileName('.epub')).toBe('Untitled')
  })
})

describe('coverTone', () => {
  it('is stable for an id and uses all three tones across ids', () => {
    expect(coverTone('local-abc')).toBe(coverTone('local-abc'))
    const tones = new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map(coverTone))
    expect(tones).toEqual(new Set(['dark', 'pale', 'mid']))
  })
})

const item = (
  id: string,
  title: string,
  author: string,
  fraction: number | undefined,
  activityAt: string,
  downloadBytes: number | null = null,
): LibraryItem => ({ id, title, author, fraction, activityAt, downloadBytes })

describe('selectBooks and filterCounts', () => {
  const items = [
    item('1', 'Walden', 'Henry David Thoreau', 0.07, '2026-10-01T00:00:00Z'),
    item('2', 'Middlemarch', 'George Eliot', 0.61, '2026-10-03T00:00:00Z'),
    item('3', 'Meditations', 'Marcus Aurelius', 1, '2026-09-01T00:00:00Z'),
    item('4', 'Dubliners', 'James Joyce', undefined, '2026-10-02T00:00:00Z'),
  ]

  it('sorts by most recent activity by default', () => {
    expect(
      selectBooks(items, { filter: 'all', query: '', sort: 'recent' }).map((b) => b.id),
    ).toEqual(['2', '4', '1', '3'])
  })

  it('sorts by title or author, ignoring case', () => {
    expect(
      selectBooks(items, { filter: 'all', query: '', sort: 'title' }).map((b) => b.id),
    ).toEqual(['4', '3', '2', '1'])
    expect(
      selectBooks(items, { filter: 'all', query: '', sort: 'author' }).map((b) => b.id),
    ).toEqual(['2', '1', '4', '3'])
  })

  it('filters by status', () => {
    const ids = (filter: 'reading' | 'unread' | 'finished') =>
      selectBooks(items, { filter, query: '', sort: 'recent' }).map((b) => b.id)
    expect(ids('reading')).toEqual(['2', '1'])
    expect(ids('unread')).toEqual(['4'])
    expect(ids('finished')).toEqual(['3'])
  })

  it('matches the query against title and author, ignoring case and accents', () => {
    const withAccent = [
      ...items,
      item('5', 'Café Society', 'Émile', undefined, '2026-01-01T00:00:00Z'),
    ]
    const ids = (query: string) =>
      selectBooks(withAccent, { filter: 'all', query, sort: 'recent' }).map((b) => b.id)
    expect(ids('ELIOT')).toEqual(['2'])
    expect(ids('cafe')).toEqual(['5'])
    expect(ids('  emile ')).toEqual(['5'])
  })

  it('counts each filter', () => {
    expect(filterCounts(items)).toEqual({
      all: 4,
      reading: 2,
      unread: 1,
      finished: 1,
      downloaded: 0,
    })
  })
})

describe('the Downloaded filter', () => {
  const items = [
    item('d1', 'Small', 'A', 0.2, '2026-10-01T00:00:00Z', 1_000),
    item('d2', 'Large', 'B', undefined, '2026-10-03T00:00:00Z', 9_000),
    item('d3', 'Drive only', 'C', undefined, '2026-10-02T00:00:00Z'),
  ]

  it('lists Drive books stored on this device, largest first, whatever the sort', () => {
    for (const sort of ['recent', 'title', 'author'] as const)
      expect(
        selectBooks(items, { filter: 'downloaded', query: '', sort }).map((b) => b.id),
      ).toEqual(['d2', 'd1'])
  })

  it('is counted', () => {
    expect(filterCounts(items).downloaded).toBe(2)
  })
})

describe('statusLabel', () => {
  it('shows progress, finished, or nothing for a book on this device', () => {
    expect(statusLabel(0.42, true)).toBe('42%')
    expect(statusLabel(1, true)).toBe('Finished')
    expect(statusLabel(undefined, true)).toBe('')
  })

  it('says "Not downloaded" for a Drive-only book while offline', () => {
    expect(statusLabel(undefined, false, false)).toBe('Not downloaded')
    expect(statusLabel(0.3, false, false)).toBe('30%')
    expect(statusLabel(undefined, true, false)).toBe('')
  })

  it('marks an unread book that is only in Drive', () => {
    expect(statusLabel(undefined, false)).toBe('Drive only')
    expect(statusLabel(0.3, false)).toBe('30%')
  })
})
