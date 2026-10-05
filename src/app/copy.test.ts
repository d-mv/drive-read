import { describe, expect, it } from 'vitest'

import {
  authErrorCopy,
  driveErrorCopy,
  formatSize,
  lastReadLabel,
  offerLabel,
  syncedLabel,
  syncNotice,
} from './copy'

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

describe('sync copy', () => {
  const now = new Date(2026, 9, 5, 15, 0)

  it('says when the last sync was, in 24-hour time', () => {
    expect(syncedLabel(new Date(2026, 9, 5, 14, 2).toISOString(), now)).toBe('Synced 14:02')
    expect(syncedLabel(new Date(2026, 9, 4, 23, 10).toISOString(), now)).toBe(
      'Synced yesterday 23:10',
    )
    expect(syncedLabel(new Date(2026, 9, 1, 9, 5).toISOString(), now)).toMatch(/^Synced .*09:05$/)
    expect(syncedLabel(null, now)).toBe('Not synced yet')
  })

  it('offers the other position with where and when it was read', () => {
    const offer = {
      fraction: 0.61,
      device: { id: 'p', name: 'Phone' },
      updatedAt: new Date(2026, 9, 4, 23, 10).toISOString(),
    }
    expect(offerLabel(offer, now)).toBe('Jump to 61%, read on Phone yesterday 23:10?')
  })

  it('explains waiting changes when offline or disconnected', () => {
    expect(syncNotice('offline', 2)).toBe("Offline. 2 changes will sync when you're back online.")
    expect(syncNotice('offline', 1)).toBe("Offline. 1 change will sync when you're back online.")
    expect(syncNotice('reconnect', 3)).toBe('Reconnect Drive to sync 3 changes.')
    expect(syncNotice('offline', 0)).toBeNull()
    expect(syncNotice('idle', 4)).toBeNull()
  })
})

describe('lastReadLabel', () => {
  const now = new Date(2026, 9, 5, 15, 0)
  const rec = (deviceId: string) => ({
    device: { id: deviceId, name: 'Phone' },
    updatedAt: new Date(2026, 9, 4, 23, 10).toISOString(),
  })

  it('names the other device and when', () => {
    expect(lastReadLabel(rec('phone'), 'laptop', now)).toBe('Last read on Phone, yesterday 23:10')
  })

  it('says nothing when it was this device', () => {
    expect(lastReadLabel(rec('laptop'), 'laptop', now)).toBeNull()
  })
})
