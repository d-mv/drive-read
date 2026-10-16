import { describe, expect, it } from 'vitest'

import { DEFAULT_SETTINGS } from '@/domain/settings'

import { readerCss, readerFonts } from './reader-theme'

const colors = { paper: '#F3F0E8', ink: '#1C1B19', ink2: '#5C5850', signal: '#D9480F' }
const fonts = [
  { family: 'Literata Variable', url: '/assets/literata.woff2', style: 'normal' as const },
  { family: 'Space Grotesk Variable', url: '/assets/grotesk.woff2', style: 'normal' as const },
]

describe('readerCss', () => {
  it('sets the theme colours on the book', () => {
    const css = readerCss(colors, DEFAULT_SETTINGS)
    expect(css).toContain('color: #1C1B19')
    expect(css).toContain('background: #F3F0E8')
    expect(css).toContain('color-scheme: light dark')
  })

  it('leaves font faces to the engine: the CSS only names the family', () => {
    expect(readerCss(colors, DEFAULT_SETTINGS)).not.toContain('@font-face')
  })

  it('overrides the typeface for all supported fonts', () => {
    expect(readerCss(colors, DEFAULT_SETTINGS)).toMatch(/font-family: 'Literata Variable'/)
    expect(readerCss(colors, { ...DEFAULT_SETTINGS, typeface: 'grotesk' })).toMatch(
      /font-family: 'Space Grotesk Variable'/,
    )
    expect(readerCss(colors, { ...DEFAULT_SETTINGS, typeface: 'cartisse' })).toMatch(
      /font-family: 'Cartisse'/,
    )
    expect(readerCss(colors, { ...DEFAULT_SETTINGS, typeface: 'libron' })).toMatch(
      /font-family: 'Libron'/,
    )
    expect(readerCss(colors, { ...DEFAULT_SETTINGS, typeface: 'jost' })).toMatch(
      /font-family: 'NV Jost'/,
    )
    expect(readerCss(colors, { ...DEFAULT_SETTINGS, typeface: 'zilla-slab' })).toMatch(
      /font-family: 'NV Zilla Slab'/,
    )
    expect(readerCss(colors, { ...DEFAULT_SETTINGS, typeface: 'readerly' })).toMatch(
      /font-family: 'Readerly'/,
    )
  })

  it("picks the chosen typeface's faces, and none for Original", () => {
    expect(readerFonts('literata', fonts).map((f) => f.url)).toEqual(['/assets/literata.woff2'])
    expect(readerFonts('grotesk', fonts).map((f) => f.url)).toEqual(['/assets/grotesk.woff2'])
    expect(readerFonts('original', fonts)).toEqual([])
  })

  it('leaves the publisher fonts alone for Original', () => {
    const css = readerCss(colors, { ...DEFAULT_SETTINGS, typeface: 'original' })
    expect(css).not.toMatch(/font-family:/)
  })

  it('applies size, line spacing and alignment', () => {
    const css = readerCss(colors, {
      ...DEFAULT_SETTINGS,
      size: 21,
      lineHeight: 1.8,
      align: 'justify',
    })
    expect(css).toContain('font-size: 21px')
    expect(css).toContain('line-height: 1.8')
    expect(css).toContain('text-align: justify')
  })
})
