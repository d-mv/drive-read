// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { newerVersion } from './updates'

const doc = (version: string, url = 'https://example.com/Drive-Read.dmg') => ({
  v: 1,
  version,
  url,
})

describe('newerVersion', () => {
  it('offers a newer version with its download link', () => {
    expect(newerVersion(doc('0.18.0'), '0.17.0')).toEqual({
      version: '0.18.0',
      url: 'https://example.com/Drive-Read.dmg',
    })
  })

  it.each([
    ['the same version', '0.17.0'],
    ['an older version', '0.16.9'],
  ])('offers nothing for %s', (_, version) => {
    expect(newerVersion(doc(version), '0.17.0')).toBeNull()
  })

  it('compares numerically, not as text', () => {
    expect(newerVersion(doc('0.10.0'), '0.9.9')?.version).toBe('0.10.0')
    expect(newerVersion(doc('1.0.0'), '0.99.99')?.version).toBe('1.0.0')
  })

  it.each([
    ['not an object', 'nope'],
    ['an unknown schema', { v: 2, version: '9.0.0', url: 'https://x.dev/a.dmg' }],
    ['a malformed version', doc('nine')],
    ['a link that is not https', doc('9.0.0', 'http://x.dev/a.dmg')],
    ['a link that is not a URL', doc('9.0.0', 'javascript:alert(1)')],
  ])('ignores %s', (_, raw) => {
    expect(newerVersion(raw, '0.17.0')).toBeNull()
  })
})
