import type { Db } from './storage/db'
import type { BlobStore } from './storage/blobs'
import type { BookEngine } from './engine/types'

/**
 * What the stores need from the outside world. main.ts provides the real ones; tests provide fakes.
 */
export interface Services {
  db: Db
  blobs: BlobStore
  /** A fresh engine for one book. */
  createEngine: (format: 'epub' | 'pdf') => BookEngine
  bookId: (file: Blob) => Promise<string>
  now: () => Date
  device: { id: string; name: string }
}

let current: Services | undefined

export function provideServices(services: Services): void {
  current = services
}

export function useServices(): Services {
  if (!current) throw new Error('provideServices() must run before the stores are used')
  return current
}
