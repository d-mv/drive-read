import type { DesktopBridge, DesktopReadError } from '@/shared/desktop'
import { Err, None, Ok, type Option, type Result, Some } from '@/shared/result'

/**
 * Book files read where they sit on disk (desktop app only). The web app has none: its books
 * live in OPFS.
 */
export interface LocalFiles {
  /** The file's path, kept so it can be read again; None when it isn't a file on disk. */
  keep(file: File): Promise<Option<string>>
  /** The file at a kept path, named and typed for the engine. */
  read(path: string, type: string): Promise<Result<File, DesktopReadError>>
  /** MD5 of a kept file, to match it with a Drive book. */
  md5(path: string): Promise<Option<string>>
}

const baseName = (path: string) => path.slice(path.lastIndexOf('/') + 1)

export function desktopFiles(bridge: DesktopBridge): LocalFiles {
  // A File made by `read` has no path Electron knows; it is already kept, at this path.
  const readFrom = new WeakMap<File, string>()
  return {
    async keep(file) {
      const path = readFrom.get(file) ?? (await bridge.keep(file))
      return path ? Some(path) : None
    },
    async read(path, type) {
      const r = await bridge.read(path)
      if (!r.ok) return Err(r.reason)
      const file = new File([r.bytes], baseName(path), { type })
      readFrom.set(file, path)
      return Ok(file)
    },
    async md5(path) {
      const hex = await bridge.md5(path)
      return hex ? Some(hex) : None
    },
  }
}

export type MemoryLocalFiles = LocalFiles & {
  /** Files on the fake disk, by path. */
  disk: Map<string, File>
  /** Where `keep` finds each file the user chooses. */
  pathOf: Map<File, string>
  /** Paths main may read: kept, or handed over by the system. */
  kept: Set<string>
  /** MD5 per path; a kept path without one has none. */
  md5Of: Map<string, string>
}

/** A fake disk for tests: a File is "on disk" when `pathOf` names it. */
export function memoryLocalFiles(): MemoryLocalFiles {
  const disk = new Map<string, File>()
  const pathOf = new Map<File, string>()
  const kept = new Set<string>()
  const md5Of = new Map<string, string>()
  return {
    disk,
    pathOf,
    kept,
    md5Of,
    async md5(path) {
      const hex = kept.has(path) ? md5Of.get(path) : undefined
      return hex ? Some(hex) : None
    },
    async keep(file) {
      const path = pathOf.get(file)
      if (!path) return None
      disk.set(path, file)
      kept.add(path)
      return Some(path)
    },
    async read(path, type) {
      if (!kept.has(path)) return Err('denied')
      const f = disk.get(path)
      if (!f) return Err('missing')
      const file = new File([f], baseName(path), { type })
      pathOf.set(file, path)
      return Ok(file)
    },
  }
}
