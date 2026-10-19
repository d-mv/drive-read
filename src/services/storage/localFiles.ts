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
}

const baseName = (path: string) => path.slice(path.lastIndexOf('/') + 1)

export function desktopFiles(bridge: DesktopBridge): LocalFiles {
  return {
    async keep(file) {
      const path = await bridge.keep(file)
      return path ? Some(path) : None
    },
    async read(path, type) {
      const r = await bridge.read(path)
      return r.ok ? Ok(new File([r.bytes], baseName(path), { type })) : Err(r.reason)
    },
  }
}

export type MemoryLocalFiles = LocalFiles & {
  /** Files on the fake disk, by path. */
  disk: Map<string, File>
  /** Where `keep` finds each file the user chooses. */
  pathOf: Map<File, string>
}

/** A fake disk for tests: a File is "on disk" when `pathOf` names it. */
export function memoryLocalFiles(): MemoryLocalFiles {
  const disk = new Map<string, File>()
  const pathOf = new Map<File, string>()
  const kept = new Set<string>()
  return {
    disk,
    pathOf,
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
      return f ? Ok(new File([f], baseName(path), { type })) : Err('missing')
    },
  }
}
