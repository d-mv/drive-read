import { describe, expect, it } from 'vitest'

import { DEFAULT_SETTINGS } from '@/domain/settings'

import { readerCss } from './reader-theme'

const colors = { paper: '#F3F0E8', ink: '#1C1B19', ink2: '#5C5850', signal: '#D9480F' }
const fonts = [
  { family: 'Literata Variable', url: '/assets/literata.woff2', style: 'normal' as const },
  { family: 'Space Grotesk Variable', url: '/assets/grotesk.woff2', style: 'normal' as const },
]

describe('readerCss', () => {
  it('sets the theme colours on the book', () => {
    const css = readerCss(colors, DEFAULT_SETTINGS, fonts)
    expect(css).toContain('color: #1C1B19')
    expect(css).toContain('background: #F3F0E8')
    expect(css).toContain('color-scheme: light dark')
  })

  it('declares the self-hosted fonts, since the book frame cannot see the app fonts', () => {
    const css = readerCss(colors, DEFAULT_SETTINGS, fonts)
    expect(css).toContain('@font-face')
    expect(css).toContain("src: url('/assets/literata.woff2') format('woff2')")
  })

  it('overrides the typeface for Literata and Grotesk', () => {
    expect(readerCss(colors, DEFAULT_SETTINGS, fonts)).toMatch(/font-family: 'Literata Variable'/)
    expect(readerCss(colors, { ...DEFAULT_SETTINGS, typeface: 'grotesk' }, fonts)).toMatch(
      /font-family: 'Space Grotesk Variable'/,
    )
  })

  it('leaves the publisher fonts alone for Original', () => {
    const css = readerCss(colors, { ...DEFAULT_SETTINGS, typeface: 'original' }, fonts)
    expect(css).not.toMatch(/font-family:/)
    expect(css).not.toContain('@font-face')
  })

  it('applies size, line spacing and alignment', () => {
    const css = readerCss(
      colors,
      { ...DEFAULT_SETTINGS, size: 21, lineHeight: 1.8, align: 'justify' },
      fonts,
    )
    expect(css).toContain('font-size: 21px')
    expect(css).toContain('line-height: 1.8')
    expect(css).toContain('text-align: justify')
  })
})
