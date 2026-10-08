import { type Mock, vi } from 'vitest'

import { provideServices, type Services } from '@/services'
import type { Gis } from '@/services/auth/gis'
import type { AppData, AppDataFile } from '@/services/drive/appdata'
import type { DriveApi, DriveError } from '@/services/drive/client'
import type { BookEngine, BookMeta, OpenError, Relocation } from '@/services/engine/types'
import { memoryBlobStore, type MemoryBlobStore } from '@/services/storage/blobs'
import { openDb } from '@/services/storage/db'
import { Err, Ok, type Result } from '@/shared/result'

export type MockEngine = { [K in keyof BookEngine]: Mock<NonNullable<BookEngine[K]>> }
export interface FakeEngine {
  engine: MockEngine
  relocate: (r: Relocation) => void
}

/** A scripted engine: `open` answers from `meta`, `relocate()` fires the relocate callback. */
export function fakeEngine(meta: Result<BookMeta, OpenError>): FakeEngine {
  let relocateCb: ((r: Relocation) => void) | undefined
  const engine: MockEngine = {
    open: vi.fn<BookEngine['open']>(async () => meta),
    mount: vi.fn<BookEngine['mount']>(async () => {}),
    next: vi.fn<BookEngine['next']>(async () => {}),
    prev: vi.fn<BookEngine['prev']>(async () => {}),
    goTo: vi.fn<BookEngine['goTo']>(async () => {}),
    setTheme: vi.fn<BookEngine['setTheme']>(),
    onRelocate: vi.fn<BookEngine['onRelocate']>((cb) => {
      relocateCb = cb
    }),
    onKeydown: vi.fn<BookEngine['onKeydown']>(),
    search: vi.fn<NonNullable<BookEngine['search']>>(async function* () {}),
    clearSearch: vi.fn<NonNullable<BookEngine['clearSearch']>>(),
    destroy: vi.fn<BookEngine['destroy']>(),
  }
  return { engine, relocate: (r) => relocateCb?.(r) }
}

export type MockGis = { [K in keyof Gis]: Mock<Gis[K]> }
export type MockDrive = { [K in keyof DriveApi]: Mock<DriveApi[K]> }

export interface TestContext extends FakeEngine {
  services: Services
  blobs: MemoryBlobStore
  gis: MockGis
  drive: MockDrive
  appdata: MemoryAppData
  /** Moves this device's clock forward. */
  advance: (ms: number) => void
}

/**
 * The Drive app folder in memory, shareable between two "devices" in one test.
 * `fail` makes every call fail with that error until cleared.
 */
export interface MemoryAppData extends AppData {
  files: Map<string, AppDataFile & { body: unknown }>
  fail: DriveError | null
  calls: { op: 'list' | 'read' | 'create' | 'update'; name?: string; keepalive?: boolean }[]
}

export function memoryAppData(): MemoryAppData {
  const files = new Map<string, AppDataFile & { body: unknown }>()
  let clock = Date.parse('2026-10-05T08:00:00Z')
  const stamp = () => new Date((clock += 1000)).toISOString()
  let seq = 0
  const store: MemoryAppData = {
    files,
    fail: null,
    calls: [],
    async list() {
      store.calls.push({ op: 'list' })
      if (store.fail) return Err(store.fail)
      return Ok(
        [...files.values()].map(({ id, name, modifiedTime }) => ({ id, name, modifiedTime })),
      )
    },
    async read(_t, id) {
      store.calls.push({ op: 'read', name: files.get(id)?.name })
      if (store.fail) return Err(store.fail)
      const f = files.get(id)
      return f ? Ok(structuredClone(f.body)) : Err({ kind: 'not-found' as const })
    },
    async create(_t, name, body, opts = {}) {
      store.calls.push({ op: 'create', name, keepalive: opts.keepalive })
      if (store.fail) return Err(store.fail)
      const id = `f${++seq}`
      const modifiedTime = stamp()
      files.set(id, { id, name, modifiedTime, body: structuredClone(body) })
      return Ok({ id, modifiedTime })
    },
    async update(_t, id, body, opts = {}) {
      store.calls.push({ op: 'update', name: files.get(id)?.name, keepalive: opts.keepalive })
      if (store.fail) return Err(store.fail)
      const f = files.get(id)
      if (!f) return Err({ kind: 'not-found' as const })
      f.body = structuredClone(body)
      f.modifiedTime = stamp()
      return Ok({ id, modifiedTime: f.modifiedTime })
    },
  }
  return store
}

/** Drive mocks answer "nothing" until a test scripts them. */
function fakeDrive(): MockDrive {
  return {
    searchBooks: vi.fn<DriveApi['searchBooks']>(async () => Ok([])),
    listChildren: vi.fn<DriveApi['listChildren']>(async () => Ok([])),
    listBooksRecursive: vi.fn<DriveApi['listBooksRecursive']>(async () =>
      Ok({ books: [], truncated: false }),
    ),
    download: vi.fn<DriveApi['download']>(async () => Err({ kind: 'not-found' as const })),
    aboutUser: vi.fn<DriveApi['aboutUser']>(async () => Ok({ permissionId: 'abc' })),
  }
}

export const META: BookMeta = {
  title: 'Harbour Year',
  author: 'Ines Calder',
  cover: new Blob(['cover'], { type: 'image/jpeg' }),
  toc: [
    { label: 'One', locator: { kind: 'href', href: 'ch1.xhtml' }, start: 0 },
    { label: 'Two', locator: { kind: 'href', href: 'ch2.xhtml' }, start: 0.5 },
  ],
}

export const epubFile = (content = 'epub-bytes', name = 'harbour_year.epub') =>
  new File([content], name, { type: 'application/epub+zip' })

let n = 0

export async function setupServices(
  opts: {
    meta?: Result<BookMeta, OpenError>
    appdata?: MemoryAppData
    device?: { id: string; name: string }
  } = {},
): Promise<TestContext> {
  const fake = fakeEngine(opts.meta ?? Ok(META))
  let clock = Date.parse('2026-10-04T12:00:00Z')
  const blobs = memoryBlobStore()
  const gis: MockGis = {
    requestToken: vi.fn<Gis['requestToken']>(async () => Err({ kind: 'popup-closed' as const })),
  }
  const drive = fakeDrive()
  const services: Services = {
    db: await openDb(`store-test-${++n}`),
    blobs,
    createEngine: () => fake.engine,
    bookId: async (f) => `local-${await f.text()}`,
    now: () => new Date((clock += 1000)),
    device: opts.device ?? { id: 'dev1', name: 'Laptop' },
    gis,
    drive,
    appdata: opts.appdata ?? memoryAppData(),
  }
  provideServices(services)
  const advance = (ms: number) => {
    clock += ms
  }
  return {
    services,
    blobs,
    gis,
    drive,
    appdata: services.appdata as MemoryAppData,
    advance,
    ...fake,
  }
}

export { Err, Ok }
