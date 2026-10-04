import { Err, None, Ok, type Option, type Result, Some } from '@/shared/result'

import { type StorageError, toStorageError } from './db'

/**
 * Book files and covers. Paths: `books/<id>`, `covers/<id>`.
 * OPFS in the app (writes through a worker with a sync access handle, reads on the main thread);
 * memory in tests.
 */
export interface BlobStore {
  put(path: string, blob: Blob): Promise<Result<void, StorageError>>
  get(path: string): Promise<Option<File>>
  remove(path: string): Promise<void>
}

export const bookPath = (id: string) => `books/${id}`
export const coverPath = (id: string) => `covers/${id}`

export type MemoryBlobStore = BlobStore & { paths(): string[] }

export function memoryBlobStore(): MemoryBlobStore {
  const files = new Map<string, File>()
  return {
    async put(path, blob) {
      files.set(path, new File([blob], path.split('/').pop()!, { type: blob.type }))
      return Ok(undefined)
    },
    async get(path) {
      const f = files.get(path)
      return f ? Some(f) : None
    },
    async remove(path) {
      files.delete(path)
    },
    paths: () => [...files.keys()].sort(),
  }
}

type WorkerReply =
  | { id: number; ok: true }
  | { id: number; ok: false; name: string; message: string }

async function fileHandle(path: string, create: boolean): Promise<FileSystemFileHandle> {
  const parts = path.split('/')
  const name = parts.pop()!
  let dir = await navigator.storage.getDirectory()
  for (const p of parts) dir = await dir.getDirectoryHandle(p, { create })
  return dir.getFileHandle(name, { create })
}

export function opfsBlobStore(): BlobStore {
  const worker = new Worker(new URL('./blobs.worker.ts', import.meta.url), { type: 'module' })
  const pending = new Map<number, (r: WorkerReply) => void>()
  let seq = 0
  worker.onmessage = (e: MessageEvent<WorkerReply>) => {
    pending.get(e.data.id)?.(e.data)
    pending.delete(e.data.id)
  }
  const call = (msg: { op: 'put'; path: string; blob: Blob } | { op: 'remove'; path: string }) =>
    new Promise<WorkerReply>((resolve) => {
      const id = ++seq
      pending.set(id, resolve)
      worker.postMessage({ ...msg, id })
    })

  return {
    async put(path, blob) {
      const r = await call({ op: 'put', path, blob })
      if (r.ok) return Ok(undefined)
      return Err(toStorageError(new DOMException(r.message, r.name)))
    },
    async get(path) {
      try {
        return Some(await (await fileHandle(path, false)).getFile())
      } catch {
        return None
      }
    },
    async remove(path) {
      await call({ op: 'remove', path })
    },
  }
}
