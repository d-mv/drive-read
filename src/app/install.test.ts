import { describe, expect, it } from 'vitest'

import { needsIosHint } from './install'

describe('needsIosHint', () => {
  const iphone =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'
  const ipad =
    'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'
  const chromeIos =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 CriOS/141.0 Mobile/15E148 Safari/604.1'
  const android =
    'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/141.0 Mobile Safari/537.36'

  it('shows the Add to Home Screen hint in iOS Safari when not installed', () => {
    expect(needsIosHint(iphone, false)).toBe(true)
    expect(needsIosHint(ipad, false)).toBe(true)
  })

  it('not once installed, not in other iOS browsers, not elsewhere', () => {
    expect(needsIosHint(iphone, true)).toBe(false)
    expect(needsIosHint(chromeIos, false)).toBe(false)
    expect(needsIosHint(android, false)).toBe(false)
  })
})
