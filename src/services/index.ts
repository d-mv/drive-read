import type { BookFormat } from '@/domain/book'

import type { Gis } from './auth/gis'
import type { AppData } from './drive/appdata'
import type { DriveApi } from './drive/client'
import type { BookEngine } from './engine/types'
import type { BlobStore } from './storage/blobs'
import type { Db } from './storage/db'
import type { Speaker } from './speech/player'
import type { LocalFiles } from './storage/localFiles'

/**
 * What the stores need from the outside world. main.ts provides the real ones; tests provide fakes.
 */
export interface Services {
  db: Db
  blobs: BlobStore
  /** A fresh engine for one book. */
  createEngine: (format: BookFormat) => BookEngine
  bookId: (file: Blob) => Promise<string>
  now: () => Date
  device: { id: string; name: string }
  gis: Gis
  drive: DriveApi
  appdata: AppData
  /** Desktop only: book files read in place on disk. Null in the web app. */
  files: LocalFiles | null
  /** Speech for reading aloud; null where the browser has none. */
  speaker: Speaker | null
}

let current: Services | undefined

export function provideServices(services: Services): void {
  current = services
}

export function useServices(): Services {
  if (!current) throw new Error('provideServices() must run before the stores are used')
  return current
}
