import { None, type Option, Some } from '@/shared/result'

/**
 * Pure progress maths shared by the engines, the progress bar and the contents panel.
 * Fractions are by byte size, as in foliate-js's SectionProgress.
 */

export interface SectionSize {
  size: number
  linear?: string
}

/** The starting fraction of each section. Non-linear and empty sections weigh nothing. */
export function sectionStarts(sections: readonly SectionSize[]): number[] {
  const sizes = sections.map((s) => (s.linear !== 'no' && s.size > 0 ? s.size : 0))
  const total = sizes.reduce((a, b) => a + b, 0)
  if (total === 0) return sizes.map(() => 0)
  let sum = 0
  return sizes.map((size) => {
    const start = sum / total
    sum += size
    return start
  })
}

/** Sorted, unique chapter starts in [0, 1), the first moved to 0 so front matter joins chapter one. */
export function normalizeStarts(raw: readonly number[]): number[] {
  const kept = [...new Set(raw.filter((x) => x >= 0 && x < 1))].sort((a, b) => a - b)
  if (kept.length === 0) return [0]
  kept[0] = 0
  return kept
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))

/** The chapter at `fraction` and how far through it the reader is. */
export function chapterAt(
  starts: readonly number[],
  fraction: number,
): Option<{ index: number; fraction: number }> {
  if (starts.length === 0) return None
  const norm = normalizeStarts(starts)
  let index = 0
  for (let i = 0; i < norm.length; i++) if (norm[i]! <= fraction) index = i
  const start = norm[index]!
  const end = norm[index + 1] ?? 1
  return Some({ index, fraction: end > start ? clamp01((fraction - start) / (end - start)) : 0 })
}

export interface Segment {
  /** Share of the bar, by chapter length. */
  weight: number
  /** 0..1 of this segment already read. */
  fill: number
}

/** One segment per chapter for the segmented progress bar. */
export function segments(starts: readonly number[], fraction: number): Segment[] {
  const norm = normalizeStarts(starts)
  return norm.map((start, i) => {
    const weight = (norm[i + 1] ?? 1) - start
    return { weight, fill: weight > 0 ? clamp01((fraction - start) / weight) : 0 }
  })
}
