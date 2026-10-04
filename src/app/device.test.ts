import { beforeEach, describe, expect, it } from 'vitest'

import { currentDevice, deviceName } from './device'

describe('deviceName', () => {
  it.each([
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', 'Phone'],
    ['Mozilla/5.0 (Linux; Android 15; Pixel 9) Mobile Safari/537.36', 'Phone'],
    ['Mozilla/5.0 (Linux; Android 15; SM-X710) Safari/537.36', 'Tablet'],
    ['Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)', 'Tablet'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 15_0) Chrome/141', 'Computer'],
  ])('%s → %s', (ua, name) => {
    expect(deviceName(ua)).toBe(name)
  })
})

describe('currentDevice', () => {
  beforeEach(() => localStorage.clear())

  it('creates an id once and keeps it', () => {
    const first = currentDevice()
    expect(first.id).toMatch(/^[0-9a-f]{8}$/)
    expect(currentDevice()).toEqual(first)
  })
})
