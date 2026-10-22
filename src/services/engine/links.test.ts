import { describe, expect, it } from 'vitest'

import { externalUrl } from './links'

describe('externalUrl', () => {
  it('accepts http and https links', () => {
    expect(externalUrl('https://example.com/a?b=1#c')).toBe('https://example.com/a?b=1#c')
    expect(externalUrl('http://example.com')).toBe('http://example.com/')
    expect(externalUrl('HTTPS://Example.com/x')).toBe('https://example.com/x')
  })

  it.each([
    'javascript:alert(1)',
    ' javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    'data:text/html,<b>x</b>',
    'mailto:a@example.com',
    'file:///etc/passwd',
    'blob:https://drive-read.mlnkv.net/1234',
    'vbscript:x',
    'tel:+100',
    'kindle:embed:0001',
    'c2.xhtml#note',
    '//example.com/protocol-relative',
    '',
    'not a url',
  ])('rejects %j', (href) => {
    expect(externalUrl(href)).toBeNull()
  })
})
