import { afterEach, describe, expect, it, vi } from 'vitest'

import { track } from './events'
import { logger } from './logger'

afterEach(() => vi.restoreAllMocks())

describe('track', () => {
  it('logs successes as info with their measurements', () => {
    const info = vi.spyOn(logger, 'info')
    track('book.opened', { format: 'epub', source: 'drive', ms: 812, downloaded_now: true })
    expect(info).toHaveBeenCalledWith('book.opened', {
      format: 'epub',
      source: 'drive',
      ms: 812,
      downloaded_now: true,
    })
  })

  it('logs failures and expiries as warnings', () => {
    const warn = vi.spyOn(logger, 'warn')
    track('book.open_failed', { reason: 'unreadable', format: 'pdf', source: 'local' })
    track('auth.expired', { where: 'sync' })
    track('sync.failed', { reason: 'offline', pending: 2 })
    track('storage.write_failed', { what: 'progress', reason: 'quota' })
    expect(warn.mock.calls.map((c) => c[0])).toEqual([
      'book.open_failed',
      'auth.expired',
      'sync.failed',
      'storage.write_failed',
    ])
  })

  it('logs crashes as errors', () => {
    const error = vi.spyOn(logger, 'error')
    track('error.uncaught', { message: 'x is undefined', source: 'reader.ts:12' })
    expect(error).toHaveBeenCalledWith('error.uncaught', {
      message: 'x is undefined',
      source: 'reader.ts:12',
    })
  })

  it('rounds durations so logs stay readable', () => {
    const info = vi.spyOn(logger, 'info')
    track('sync.completed', { ms: 123.456, pushed: 1, adopted: 0, offered: 0, library_changes: 0 })
    expect(info.mock.calls[0]![1]).toMatchObject({ ms: 123 })
  })
})
