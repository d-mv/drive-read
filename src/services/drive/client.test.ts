import { describe, expect, it, vi } from 'vitest'

import { Err, isOk } from '@/shared/result'

import { createDriveApi, driveFormat, type FetchFn, bookQuery } from './client'

type Route = (url: URL, init: RequestInit) => Response | Promise<Response>

function fakeFetch(route: Route) {
  const calls: { url: URL; init: RequestInit }[] = []
  const fn = vi.fn<FetchFn>(async (input, init = {}) => {
    const url = new URL(String(input))
    calls.push({ url, init })
    return route(url, init)
  })
  return { fn, calls }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const file = (id: string, name: string, mimeType = 'application/epub+zip') => ({
  id,
  name,
  mimeType,
  size: '100',
  md5Checksum: `md5-${id}`,
  modifiedTime: '2026-10-01T00:00:00Z',
})

describe('bookQuery', () => {
  it('matches EPUB, PDF and FB2 files that are not trashed', () => {
    expect(bookQuery('')).toBe(
      "trashed = false and (mimeType = 'application/epub+zip' or mimeType = 'application/pdf'" +
        " or mimeType = 'application/x-fictionbook+xml' or mimeType = 'application/x-fictionbook'" +
        " or mimeType = 'application/x-zip-compressed-fb2'" +
        " or name contains 'fb2' or name contains 'fbz')",
    )
  })

  it('adds a name filter with quotes and backslashes escaped', () => {
    expect(bookQuery(" o'brien\\x ")).toContain("and name contains 'o\\'brien\\\\x'")
  })
})

describe('errors', () => {
  const api = (status: number) => createDriveApi(fakeFetch(() => json({}, status)).fn)

  it.each([
    [401, { kind: 'auth-expired' }],
    [404, { kind: 'not-found' }],
    [403, { kind: 'forbidden' }],
    [429, { kind: 'rate-limited' }],
    [500, { kind: 'http', status: 500 }],
  ])('HTTP %i → %o', async (status, error) => {
    expect(await api(status).searchBooks('t', '')).toEqual(Err(error))
  })

  it('a 403 with a rate-limit reason is rate-limited', async () => {
    const f = fakeFetch(() =>
      json({ error: { errors: [{ reason: 'userRateLimitExceeded' }] } }, 403),
    )
    expect(await createDriveApi(f.fn).searchBooks('t', '')).toEqual(Err({ kind: 'rate-limited' }))
  })

  it('a network failure is offline', async () => {
    const f = fakeFetch(() => {
      throw new TypeError('Failed to fetch')
    })
    expect(await createDriveApi(f.fn).searchBooks('t', '')).toEqual(Err({ kind: 'offline' }))
  })
})

describe('searchBooks', () => {
  it('sends the token and follows pages', async () => {
    const f = fakeFetch((url) =>
      url.searchParams.get('pageToken')
        ? json({ files: [file('b', 'B.epub')] })
        : json({ files: [file('a', 'A.epub')], nextPageToken: 'p2' }),
    )
    const r = await createDriveApi(f.fn).searchBooks('tok', 'eliot')
    expect(isOk(r) && r.value.map((x) => x.id)).toEqual(['a', 'b'])
    expect(new Headers(f.calls[0]!.init.headers).get('authorization')).toBe('Bearer tok')
    expect(f.calls[0]!.url.searchParams.get('q')).toContain("name contains 'eliot'")
  })

  it('maps Drive fields to DriveFile', async () => {
    const f = fakeFetch(() => json({ files: [file('a', 'A.epub')] }))
    const r = await createDriveApi(f.fn).searchBooks('t', '')
    expect(r).toEqual({
      _tag: 'Ok',
      value: [
        {
          id: 'a',
          name: 'A.epub',
          mimeType: 'application/epub+zip',
          size: 100,
          md5: 'md5-a',
          modifiedTime: '2026-10-01T00:00:00Z',
        },
      ],
    })
  })
})

describe('driveFormat', () => {
  it.each([
    [{ name: 'A.epub', mimeType: 'application/epub+zip' }, 'epub'],
    [{ name: 'A.pdf', mimeType: 'application/pdf' }, 'pdf'],
    [{ name: 'Пламя.fb2', mimeType: 'application/octet-stream' }, 'fb2'],
    [{ name: 'Пламя.fb2.zip', mimeType: 'application/zip' }, 'fb2'],
    [{ name: 'Пламя.fbz', mimeType: 'application/octet-stream' }, 'fb2'],
    [{ name: 'Book', mimeType: 'application/x-fictionbook+xml' }, 'fb2'],
    [{ name: 'fb2 notes.txt', mimeType: 'text/plain' }, null],
    [{ name: 'cover.jpg', mimeType: 'image/jpeg' }, null],
  ])('%o → %s', (f, format) => {
    expect(driveFormat(f)).toBe(format)
  })
})

describe('searchBooks keeps only books', () => {
  it('drops files that matched "fb2" in their name but are not books', async () => {
    const f = fakeFetch(() =>
      json({
        files: [
          file('a', 'A.epub'),
          file('b', 'Пламя.fb2', 'application/octet-stream'),
          file('n', 'fb2 reading list.txt', 'text/plain'),
        ],
      }),
    )
    const r = await createDriveApi(f.fn).searchBooks('t', '')
    expect(isOk(r) && r.value.map((x) => x.id)).toEqual(['a', 'b'])
  })
})

describe('listChildren', () => {
  it('lists every child and keeps folders and books, whatever MIME type Drive gave them', async () => {
    const f = fakeFetch(() =>
      json({
        files: [
          file('f1', 'dippel,-julia', 'application/vnd.google-apps.folder'),
          file('a', 'A.epub'),
          file('b', 'Пламя.fb2', 'application/octet-stream'),
          file('c', 'cover.jpg', 'image/jpeg'),
        ],
      }),
    )
    const r = await createDriveApi(f.fn).listChildren('t', 'root')
    expect(isOk(r) && r.value.map((x) => x.id)).toEqual(['f1', 'a', 'b'])
    expect(f.calls[0]!.url.searchParams.get('q')).toBe("'root' in parents and trashed = false")
  })

  it('lists folders and books in a folder', async () => {
    const f = fakeFetch(() =>
      json({
        files: [
          file('f1', 'eliot,-george', 'application/vnd.google-apps.folder'),
          file('a', 'A.epub'),
        ],
      }),
    )
    const r = await createDriveApi(f.fn).listChildren('t', 'root')
    expect(isOk(r) && r.value.map((x) => x.id)).toEqual(['f1', 'a'])
    expect(f.calls[0]!.url.searchParams.get('q')).toContain("'root' in parents")
  })
})

describe('listBooksRecursive', () => {
  const FOLDER = 'application/vnd.google-apps.folder'
  const tree: Record<string, ReturnType<typeof file>[]> = {
    books: [file('austen', 'austen,-jane', FOLDER), file('eliot', 'eliot,-george', FOLDER)],
    austen: [file('a1', 'Emma - Jane Austen.epub')],
    eliot: [file('e1', 'Middlemarch - George Eliot.epub'), file('deep', 'more', FOLDER)],
    deep: [file('e2', 'Romola - George Eliot.pdf', 'application/pdf')],
  }
  const route: Route = (url) => {
    const parent = /'([^']+)' in parents/.exec(url.searchParams.get('q') ?? '')?.[1] ?? ''
    return json({ files: tree[parent] ?? [] })
  }

  it('collects books from every subfolder', async () => {
    const r = await createDriveApi(fakeFetch(route).fn).listBooksRecursive('t', 'books')
    expect(isOk(r) && r.value.books.map((b) => b.id).sort()).toEqual(['a1', 'e1', 'e2'])
    expect(isOk(r) && r.value.truncated).toBe(false)
  })

  it('stops at the folder limit and says so', async () => {
    const r = await createDriveApi(fakeFetch(route).fn).listBooksRecursive('t', 'books', {
      maxFolders: 2,
    })
    expect(isOk(r) && r.value.truncated).toBe(true)
  })
})

describe('download', () => {
  it('streams the file and reports progress', async () => {
    const bytes = new Uint8Array(10).fill(7)
    const f = fakeFetch((url) => {
      expect(url.searchParams.get('alt')).toBe('media')
      return new Response(bytes, { headers: { 'content-length': '10' } })
    })
    const progress: number[] = []
    const r = await createDriveApi(f.fn).download(
      't',
      { id: 'a', mimeType: 'application/epub+zip', size: 10 },
      (p) => progress.push(p),
    )
    expect(isOk(r) && r.value.size).toBe(10)
    expect(isOk(r) && r.value.type).toBe('application/epub+zip')
    expect(progress.at(-1)).toBe(1)
  })
})

describe('aboutUser', () => {
  it("returns the account's stable permission id", async () => {
    const f = fakeFetch((url) => {
      expect(url.pathname).toBe('/drive/v3/about')
      expect(url.searchParams.get('fields')).toBe('user(permissionId)')
      return json({ user: { permissionId: '0123' } })
    })
    expect(await createDriveApi(f.fn).aboutUser('t')).toEqual({
      _tag: 'Ok',
      value: { permissionId: '0123' },
    })
  })
})

describe('listAllBooks', () => {
  it('lists every book and says the listing is complete', async () => {
    const f = fakeFetch(() =>
      json({ files: [file('a', 'A.epub'), file('n', 'fb2 list.txt', 'text/plain')] }),
    )
    const r = await createDriveApi(f.fn).listAllBooks('t')
    expect(r).toEqual({
      _tag: 'Ok',
      value: { books: [expect.objectContaining({ id: 'a' })], complete: true },
    })
  })

  it('is not complete when Drive had more than it fetched, even after dropping non-books', async () => {
    let page = 0
    const f = fakeFetch(() => {
      page++
      const files = Array.from({ length: 1000 }, (_, i) =>
        file(
          `p${page}-${i}`,
          i % 2 ? `x${i}.fb2` : `fb2 note ${i}.txt`,
          i % 2 ? 'application/octet-stream' : 'text/plain',
        ),
      )
      return json({ files, nextPageToken: `p${page + 1}` })
    })
    const r = await createDriveApi(f.fn).listAllBooks('t')
    expect(r._tag === 'Ok' && r.value.complete).toBe(false)
    expect(r._tag === 'Ok' && r.value.books.length).toBe(2500)
  })
})
