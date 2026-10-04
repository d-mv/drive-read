import { type Mock, vi } from 'vitest'

import { provideServices, type Services } from '@/services'
import type { BookEngine, BookMeta, OpenError, Relocation } from '@/services/engine/types'
import { memoryBlobStore, type MemoryBlobStore } from '@/services/storage/blobs'
import { openDb } from '@/services/storage/db'
import { Err, Ok, type Result } from '@/shared/result'

export type MockEngine = { [K in keyof BookEngine]: Mock<BookEngine[K]> }
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
    destroy: vi.fn<BookEngine['destroy']>(),
  }
  return { engine, relocate: (r) => relocateCb?.(r) }
}

export interface TestContext extends FakeEngine {
  services: Services
  blobs: MemoryBlobStore
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
  opts: { meta?: Result<BookMeta, OpenError> } = {},
): Promise<TestContext> {
  const fake = fakeEngine(opts.meta ?? Ok(META))
  let clock = Date.parse('2026-10-04T12:00:00Z')
  const blobs = memoryBlobStore()
  const services: Services = {
    db: await openDb(`store-test-${++n}`),
    blobs,
    createEngine: () => fake.engine,
    bookId: async (f) => `local-${await f.text()}`,
    now: () => new Date((clock += 1000)),
    device: { id: 'dev1', name: 'Laptop' },
  }
  provideServices(services)
  return { services, blobs, ...fake }
}

export { Err, Ok }
