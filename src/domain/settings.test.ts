import { describe, expect, it } from 'vitest'

import {
  DEFAULT_SETTINGS,
  nextTheme,
  paginatorLayout,
  resolveTheme,
  stepLineHeight,
  stepSize,
} from './settings'

describe('resolveTheme', () => {
  it('follows the system only when set to system', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
  })
})

describe('nextTheme', () => {
  it('flips the resolved theme, so one tap always changes what you see', () => {
    expect(nextTheme('system', true)).toBe('light')
    expect(nextTheme('system', false)).toBe('dark')
    expect(nextTheme('dark', false)).toBe('light')
  })
})

describe('stepSize', () => {
  it('moves one pixel within 14..28', () => {
    expect(stepSize(19, 1)).toBe(20)
    expect(stepSize(19, -1)).toBe(18)
    expect(stepSize(28, 1)).toBe(28)
    expect(stepSize(14, -1)).toBe(14)
  })
})

describe('stepLineHeight', () => {
  it('moves 0.05 within 1.3..2.0 without float drift', () => {
    expect(stepLineHeight(1.65, 1)).toBe(1.7)
    expect(stepLineHeight(1.65, -1)).toBe(1.6)
    expect(stepLineHeight(2, 1)).toBe(2)
    expect(stepLineHeight(1.3, -1)).toBe(1.3)
    expect(stepLineHeight(1.35, -1)).toBe(1.3)
  })
})

describe('paginatorLayout', () => {
  it('maps margins to a text column width: wider margins, narrower column', () => {
    expect(paginatorLayout('narrow').maxInlineSize).toBe(760)
    expect(paginatorLayout('medium').maxInlineSize).toBe(620)
    expect(paginatorLayout('wide').maxInlineSize).toBe(500)
  })
})

describe('DEFAULT_SETTINGS', () => {
  it('matches the design canvas', () => {
    expect(DEFAULT_SETTINGS).toMatchObject({
      theme: 'system',
      typeface: 'literata',
      size: 19,
      lineHeight: 1.65,
      margins: 'medium',
      align: 'left',
    })
  })
})
