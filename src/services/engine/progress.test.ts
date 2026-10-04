import { describe, expect, it } from 'vitest'

import { None, Some } from '@/shared/result'

import { chapterAt, normalizeStarts, sectionStarts, segments } from './progress'

describe('sectionStarts', () => {
  it('gives each section its starting fraction by byte size', () => {
    expect(sectionStarts([{ size: 100 }, { size: 300 }, { size: 600 }])).toEqual([0, 0.1, 0.4])
  })

  it('gives non-linear and empty sections no weight', () => {
    expect(
      sectionStarts([{ size: 100 }, { size: 500, linear: 'no' }, { size: 0 }, { size: 100 }]),
    ).toEqual([0, 0.5, 0.5, 0.5])
  })

  it('returns zeros for a book with no measurable size', () => {
    expect(sectionStarts([{ size: 0 }, { size: 0 }])).toEqual([0, 0])
  })
})

describe('normalizeStarts', () => {
  it('sorts, dedupes, drops values at or past the end, and anchors the first at 0', () => {
    expect(normalizeStarts([0.5, 0.02, 0.5, 1, 0.25])).toEqual([0, 0.25, 0.5])
  })

  it('returns [0] when nothing usable is left', () => {
    expect(normalizeStarts([])).toEqual([0])
    expect(normalizeStarts([1, 1.2])).toEqual([0])
  })
})

describe('chapterAt', () => {
  const starts = [0, 0.25, 0.5, 0.75]

  it('finds the chapter and the fraction through it', () => {
    expect(chapterAt(starts, 0.6)).toEqual(Some({ index: 2, fraction: expect.closeTo(0.4, 5) }))
  })

  it('treats a chapter start as the beginning of that chapter', () => {
    expect(chapterAt(starts, 0.25)).toEqual(Some({ index: 1, fraction: 0 }))
  })

  it('uses the end of the book as the end of the last chapter', () => {
    expect(chapterAt(starts, 0.875)).toEqual(Some({ index: 3, fraction: 0.5 }))
    expect(chapterAt(starts, 1)).toEqual(Some({ index: 3, fraction: 1 }))
  })

  it('is None for a book without chapters', () => {
    expect(chapterAt([], 0.3)).toEqual(None)
  })
})

describe('segments', () => {
  it('weights each chapter by its length and fills up to the reading position', () => {
    const near = (x: number) => expect.closeTo(x, 9)
    expect(segments([0, 0.2, 0.6], 0.4)).toEqual([
      { weight: near(0.2), fill: 1 },
      { weight: near(0.4), fill: near(0.5) },
      { weight: near(0.4), fill: 0 },
    ])
  })

  it('normalizes raw starts first', () => {
    expect(segments([0.1, 0.5], 0)).toEqual([
      { weight: 0.5, fill: 0 },
      { weight: 0.5, fill: 0 },
    ])
  })

  it('is one full-width segment for a book without chapters', () => {
    expect(segments([], 0.3)).toEqual([{ weight: 1, fill: 0.3 }])
  })
})
