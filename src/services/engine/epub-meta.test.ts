import { describe, expect, it } from 'vitest'

import { formatAuthors, formatLanguageMap, tocEntries } from './epub-meta'

describe('formatLanguageMap', () => {
  it('passes strings through', () => {
    expect(formatLanguageMap('Walden')).toBe('Walden')
  })

  it('prefers the given language, then English, then the first entry', () => {
    expect(formatLanguageMap({ ja: '草枕', en: 'Kusamakura' }, 'ja')).toBe('草枕')
    expect(formatLanguageMap({ ja: '草枕', en: 'Kusamakura' })).toBe('Kusamakura')
    expect(formatLanguageMap({ fr: 'Candide' })).toBe('Candide')
  })

  it('is empty for missing values', () => {
    expect(formatLanguageMap(undefined)).toBe('')
  })
})

describe('formatAuthors', () => {
  it('handles a string, a contributor object and a list', () => {
    expect(formatAuthors('Jane Austen')).toBe('Jane Austen')
    expect(formatAuthors({ name: 'Homer' })).toBe('Homer')
    expect(formatAuthors([{ name: 'Marx' }, 'Engels'])).toBe('Marx, Engels')
    expect(formatAuthors({ name: { en: 'Leo Tolstoy', ru: 'Лев Толстой' } })).toBe('Leo Tolstoy')
  })

  it('is empty when there is no author', () => {
    expect(formatAuthors(undefined)).toBe('')
  })
})

describe('tocEntries', () => {
  const toc = [
    { label: ' Cover ', href: 'cover.xhtml' },
    { label: 'One', href: 'ch1.xhtml#start', subitems: [{ label: 'One A', href: 'ch1.xhtml#a' }] },
    { label: 'Two', href: 'ch2.xhtml' },
    { label: 'Broken', href: 'missing.xhtml' },
  ]
  const index: Record<string, number> = { 'cover.xhtml': 0, 'ch1.xhtml': 1, 'ch2.xhtml': 2 }
  const resolve = (href: string) => index[href.split('#')[0]!]

  it('keeps top-level entries, starting at their section and trimmed', () => {
    expect(tocEntries(toc, [0, 0.01, 0.5], resolve)).toEqual([
      { label: 'Cover', locator: { kind: 'href', href: 'cover.xhtml' }, start: 0 },
      { label: 'One', locator: { kind: 'href', href: 'ch1.xhtml#start' }, start: 0.01 },
      { label: 'Two', locator: { kind: 'href', href: 'ch2.xhtml' }, start: 0.5 },
    ])
  })
})
