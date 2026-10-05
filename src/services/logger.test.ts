import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createLogger } from './logger'

type Call = { url: string; init: RequestInit }

function fakeFetch(responses: Array<number | Error> = []) {
  const calls: Call[] = []
  const fn = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async (url, init) => {
    calls.push({ url, init })
    const next = responses.shift() ?? 200
    if (next instanceof Error) throw next
    return new Response('{}', { status: next })
  })
  return { fn, calls, bodies: () => calls.map((c) => JSON.parse(String(c.init.body))) }
}

const base = {
  baseUrl: 'https://logger.test/api',
  ingestKey: 'k',
  env: 'test',
  appVersion: '0.1.0',
  sessionId: 's1',
  now: () => new Date('2026-10-04T12:00:00.000Z'),
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('createLogger', () => {
  it('batches events and sends them after the flush interval', async () => {
    const f = fakeFetch()
    const log = createLogger({ ...base, fetch: f.fn, flushMs: 5000 })
    log.info('book opened', { format: 'epub' })
    log.warn('slow page')
    expect(f.calls).toHaveLength(0)

    await vi.advanceTimersByTimeAsync(5000)
    expect(f.calls).toHaveLength(1)
    expect(f.calls[0]!.url).toBe('https://logger.test/api/v1/ingest')
    expect(new Headers(f.calls[0]!.init.headers).get('x-ingest-key')).toBe('k')
    expect(f.bodies()[0]).toEqual([
      {
        timestamp: '2026-10-04T12:00:00.000Z',
        level: 'info',
        message: 'book opened',
        env: 'test',
        app_version: '0.1.0',
        session_id: 's1',
        platform: 'web',
        context: { format: 'epub' },
      },
      expect.objectContaining({ level: 'warn', message: 'slow page' }),
    ])
  })

  it('flushes at once when the batch is full', async () => {
    const f = fakeFetch()
    const log = createLogger({ ...base, fetch: f.fn, maxBatch: 2 })
    log.info('a')
    log.info('b')
    await vi.advanceTimersByTimeAsync(0)
    expect(f.bodies()[0]).toHaveLength(2)
  })

  it('retries once after a network error, then drops the batch', async () => {
    const f = fakeFetch([new Error('offline'), new Error('offline')])
    const log = createLogger({ ...base, fetch: f.fn })
    log.error('boom')
    await log.flush()
    await vi.advanceTimersByTimeAsync(1000)
    expect(f.calls).toHaveLength(2)
    await log.flush()
    expect(f.calls).toHaveLength(2)
  })

  it('does not retry a rejected batch', async () => {
    const f = fakeFetch([400])
    const log = createLogger({ ...base, fetch: f.fn })
    log.info('x')
    await log.flush()
    await vi.advanceTimersByTimeAsync(1000)
    expect(f.calls).toHaveLength(1)
  })

  it('sends with keepalive when flushed on page hide', async () => {
    const f = fakeFetch()
    const log = createLogger({ ...base, fetch: f.fn })
    log.info('x')
    await log.flush({ keepalive: true })
    expect(f.calls[0]!.init.keepalive).toBe(true)
  })

  it('sends nothing without a base URL or key', async () => {
    const f = fakeFetch()
    const log = createLogger({ ...base, ingestKey: '', fetch: f.fn })
    log.info('x')
    await log.flush()
    expect(f.calls).toHaveLength(0)
  })

  it('never throws, even if fetch does', async () => {
    const f = fakeFetch([new Error('x'), new Error('x')])
    const log = createLogger({ ...base, fetch: f.fn })
    log.info('x')
    await expect(log.flush()).resolves.toBeUndefined()
  })
})

describe('identity', () => {
  it('adds device and user_id to events once set, and drops user_id when cleared', async () => {
    const f = fakeFetch()
    const log = createLogger({ ...base, fetch: f.fn })
    log.info('before')
    log.setIdentity({ device: 'a3f9c2e1/Phone', userId: 'u_0123456789abcdef' })
    log.info('after')
    log.setIdentity({ userId: null })
    log.info('signed out')
    await log.flush()
    const [before, after, out] = f.bodies()[0]
    expect(before).not.toHaveProperty('device')
    expect(before).not.toHaveProperty('user_id')
    expect(after).toMatchObject({ device: 'a3f9c2e1/Phone', user_id: 'u_0123456789abcdef' })
    expect(out).toMatchObject({ device: 'a3f9c2e1/Phone' })
    expect(out).not.toHaveProperty('user_id')
  })
})
