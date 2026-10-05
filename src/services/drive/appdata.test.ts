import { describe, expect, it, vi } from 'vitest'

import { Err, Ok } from '@/shared/result'

import { createAppData } from './appdata'
import type { FetchFn } from './client'

function fakeFetch(route: (url: URL, init: RequestInit) => Response) {
  const calls: { url: URL; init: RequestInit }[] = []
  const fn = vi.fn<FetchFn>(async (input, init = {}) => {
    const url = new URL(String(input))
    calls.push({ url, init })
    return route(url, init)
  })
  return { fn, calls }
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

describe('appData', () => {
  it('lists the app folder with names and modified times', async () => {
    const f = fakeFetch(() =>
      json({ files: [{ id: 'x', name: 'library.json', modifiedTime: '2026-10-05T10:00:00Z' }] }),
    )
    const r = await createAppData(f.fn).list('tok')
    expect(r).toEqual(Ok([{ id: 'x', name: 'library.json', modifiedTime: '2026-10-05T10:00:00Z' }]))
    expect(f.calls[0]!.url.searchParams.get('spaces')).toBe('appDataFolder')
    expect(new Headers(f.calls[0]!.init.headers).get('authorization')).toBe('Bearer tok')
  })

  it('reads a JSON file', async () => {
    const f = fakeFetch((url) => {
      expect(url.searchParams.get('alt')).toBe('media')
      return json({ v: 1, entries: [] })
    })
    expect(await createAppData(f.fn).read('tok', 'x')).toEqual(Ok({ v: 1, entries: [] }))
  })

  it('creates a file in appDataFolder with a multipart upload', async () => {
    const f = fakeFetch(() => json({ id: 'new', modifiedTime: '2026-10-05T10:00:00Z' }))
    const r = await createAppData(f.fn).create('tok', 'progress-b1.json', { a: 1 })
    expect(r).toEqual(Ok({ id: 'new', modifiedTime: '2026-10-05T10:00:00Z' }))
    const call = f.calls[0]!
    expect(call.init.method).toBe('POST')
    expect(call.url.pathname).toBe('/upload/drive/v3/files')
    expect(call.url.searchParams.get('uploadType')).toBe('multipart')
    const body = call.init.body as FormData
    expect(JSON.parse(await (body.get('metadata') as Blob).text())).toEqual({
      name: 'progress-b1.json',
      parents: ['appDataFolder'],
    })
    expect(JSON.parse(await (body.get('file') as Blob).text())).toEqual({ a: 1 })
  })

  it('updates a file in place and returns its new modified time', async () => {
    const f = fakeFetch(() => json({ id: 'x', modifiedTime: '2026-10-05T11:00:00Z' }))
    const r = await createAppData(f.fn).update('tok', 'x', { a: 2 }, { keepalive: true })
    expect(r).toEqual(Ok({ id: 'x', modifiedTime: '2026-10-05T11:00:00Z' }))
    const call = f.calls[0]!
    expect(call.init.method).toBe('PATCH')
    expect(call.url.pathname).toBe('/upload/drive/v3/files/x')
    expect(call.url.searchParams.get('uploadType')).toBe('media')
    expect(call.init.keepalive).toBe(true)
  })

  it('maps errors like the Drive client', async () => {
    expect(await createAppData(fakeFetch(() => json({}, 401)).fn).list('t')).toEqual(
      Err({ kind: 'auth-expired' }),
    )
    const offline = fakeFetch(() => {
      throw new TypeError('Failed to fetch')
    })
    expect(await createAppData(offline.fn).read('t', 'x')).toEqual(Err({ kind: 'offline' }))
  })
})
