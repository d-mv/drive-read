import { describe, expect, it } from 'vitest'

import { blockedOrigin, errorSource } from './observability'

describe('blockedOrigin', () => {
  it('keeps only the origin or the kind, never a path that could name a book', () => {
    expect(blockedOrigin('https://evil.example/x/y.js?q=1')).toBe('https://evil.example')
    expect(blockedOrigin('blob:https://drive-read.mlnkv.net/1234-uuid')).toBe('blob')
    expect(blockedOrigin('inline')).toBe('inline')
    expect(blockedOrigin('eval')).toBe('eval')
    expect(blockedOrigin('')).toBe('inline')
  })
})

describe('errorSource', () => {
  it('is the file name and line, without the origin or hash path', () => {
    expect(errorSource('https://drive-read.mlnkv.net/assets/reader-Ab12.js', 3, 1407)).toBe(
      'reader-Ab12.js:3',
    )
    expect(errorSource(undefined, undefined, undefined)).toBe('unknown')
  })
})
