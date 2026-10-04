import { describe, expect, it } from 'vitest'

import { authErrorCopy, driveErrorCopy, formatSize } from './copy'

describe('copy', () => {
  it('explains each sign-in failure', () => {
    expect(authErrorCopy({ kind: 'popup-blocked' })).toMatch(/pop-ups/)
    expect(authErrorCopy({ kind: 'scopes-missing' })).toMatch(/both/)
    expect(authErrorCopy({ kind: 'unavailable' })).toMatch(/could not load/)
  })

  it('explains Drive errors', () => {
    expect(driveErrorCopy({ kind: 'offline' })).toMatch(/offline/i)
    expect(driveErrorCopy({ kind: 'http', status: 503 })).toMatch(/503/)
  })

  it('formats sizes in MB with one decimal, KB below 0.1 MB', () => {
    expect(formatSize(1_900_000)).toBe('1.8 MB')
    expect(formatSize(40_000)).toBe('39 KB')
    expect(formatSize(0)).toBe('0 KB')
  })
})
