import { describe, expect, it } from 'vitest'

import {
  blockedOrigin,
  errorName,
  errorSource,
  isBenignError,
  vueErrorEvent,
} from './observability'

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

describe('isBenignError', () => {
  it('ignores the browser ResizeObserver notice, which is not a crash', () => {
    expect(isBenignError('ResizeObserver loop completed with undelivered notifications.')).toBe(
      true,
    )
    expect(isBenignError('ResizeObserver loop limit exceeded')).toBe(true)
    expect(isBenignError("Cannot read properties of undefined (reading 'x')")).toBe(false)
  })
})

describe('errorName', () => {
  it('is the kind of error only, never its message (which can quote book text)', () => {
    expect(errorName(new TypeError('Cannot read “Secret Title”'))).toBe('TypeError')
    expect(errorName(new DOMException('quota', 'QuotaExceededError'))).toBe('QuotaExceededError')
    expect(errorName('a thrown string with a title')).toBe('string')
    expect(errorName(undefined)).toBe('undefined')
    expect(errorName({ name: 'x'.repeat(200) })).toBe('object')
  })
})

describe('vueErrorEvent', () => {
  it('reports Vue render and handler errors with where they happened, not the message', () => {
    expect(vueErrorEvent(new RangeError('“A Book” page 3'), 'render function')).toEqual({
      name: 'RangeError',
      source: 'vue:render function',
    })
    expect(vueErrorEvent('plain', 'setup function')).toEqual({
      name: 'string',
      source: 'vue:setup function',
    })
  })
})
