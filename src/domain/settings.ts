export type ThemeSetting = 'system' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'
export type Typeface =
  | 'literata'
  | 'cartisse'
  | 'libron'
  | 'readerly'
  | 'grotesk'
  | 'jost'
  | 'zilla-slab'
  | 'original'
export type Margins = 'narrow' | 'medium' | 'wide'
export type Align = 'left' | 'justify'

export interface Settings {
  v: 1
  theme: ThemeSetting
  typeface: Typeface
  /** px */
  size: number
  lineHeight: number
  margins: Margins
  align: Align
  libraryView: 'grid' | 'list'
}

export const DEFAULT_SETTINGS: Settings = {
  v: 1,
  theme: 'system',
  typeface: 'literata',
  size: 19,
  lineHeight: 1.65,
  margins: 'medium',
  align: 'left',
  libraryView: 'grid',
}

export const SIZE_RANGE = { min: 14, max: 28 } as const
export const LINE_HEIGHT_RANGE = { min: 1.3, max: 2, step: 0.05 } as const

export function resolveTheme(setting: ThemeSetting, prefersDark: boolean): ResolvedTheme {
  if (setting === 'system') return prefersDark ? 'dark' : 'light'
  return setting
}

/** The theme button flips what is on screen, leaving "system" for the settings panel. */
export function nextTheme(setting: ThemeSetting, prefersDark: boolean): ResolvedTheme {
  return resolveTheme(setting, prefersDark) === 'dark' ? 'light' : 'dark'
}

const clamp = (x: number, min: number, max: number) => Math.min(max, Math.max(min, x))

export function stepSize(size: number, dir: 1 | -1): number {
  return clamp(size + dir, SIZE_RANGE.min, SIZE_RANGE.max)
}

export function stepLineHeight(lineHeight: number, dir: 1 | -1): number {
  const { min, max, step } = LINE_HEIGHT_RANGE
  const next = Math.round((lineHeight + dir * step) / step) * step
  return clamp(Number(next.toFixed(2)), min, max)
}

const COLUMN: Record<Margins, number> = { narrow: 760, medium: 620, wide: 500 }

/** Margins set the width of the text column: wider margins, narrower column. */
export function paginatorLayout(margins: Margins): { maxInlineSize: number } {
  return { maxInlineSize: COLUMN[margins] }
}
