/**
 * Which files the app may read, and reading them. Main reads only books the user chose
 * (picker, drag-and-drop, Finder) and that are therefore kept here; never a path the page names.
 */
import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { type FileHandle, lstat, open, readFile, rename, writeFile } from 'node:fs/promises'
import { isAbsolute, normalize } from 'node:path'

import type { DesktopReadResult } from '../src/shared/desktop'

/** EPUB, PDF and FB2 (plain, `.fbz` or `.fb2.zip`) by name; the page checks the contents. */
export const isBookName = (name: string) => /\.(epub|pdf|fb2|fbz|fb2\.zip)$/i.test(name)

/** An absolute, normalised book path, or null. */
function bookPath(path: unknown): string | null {
  if (typeof path !== 'string' || !isAbsolute(path)) return null
  const clean = normalize(path)
  return isBookName(clean) ? clean : null
}

export interface Grants {
  has(path: string): boolean
  add(path: string): Promise<void>
}

interface GrantsDoc {
  v: 1
  paths: string[]
}

const isGrantsDoc = (x: unknown): x is GrantsDoc =>
  typeof x === 'object' &&
  x !== null &&
  (x as GrantsDoc).v === 1 &&
  Array.isArray((x as GrantsDoc).paths) &&
  (x as GrantsDoc).paths.every((p) => typeof p === 'string')

/** Kept paths, persisted as JSON in the app's profile. A damaged file starts the list afresh. */
export async function loadGrants(file: string): Promise<Grants> {
  const paths = new Set<string>()
  try {
    const doc: unknown = JSON.parse(await readFile(file, 'utf8'))
    if (isGrantsDoc(doc)) for (const p of doc.paths) paths.add(p)
  } catch {
    // No file yet, or unreadable: nothing kept.
  }
  return {
    has: (path) => paths.has(path),
    async add(path) {
      if (paths.has(path)) return
      paths.add(path)
      const doc: GrantsDoc = { v: 1, paths: [...paths] }
      // Write then rename, so a crash never leaves half a file.
      await writeFile(`${file}.tmp`, JSON.stringify(doc))
      await rename(`${file}.tmp`, file)
    },
  }
}

/** Keeps a chosen book so it can be read later. Its normalised path, or null if refused. */
export async function keepFile(grants: Grants, path: unknown): Promise<string | null> {
  const clean = bookPath(path)
  if (!clean) return null
  // lstat: a symlink named as a book is refused, whatever it points at.
  const info = await lstat(clean).catch(() => null)
  if (!info?.isFile()) return null
  await grants.add(clean)
  return clean
}

/** Whether a path may be read: kept, and named exactly as kept. */
function keptPath(grants: Grants, path: unknown): string | null {
  const clean = bookPath(path)
  // Compare the path as given too: a path that only normalises to a kept one is refused.
  return clean && clean === path && grants.has(clean) ? clean : null
}

/**
 * Opens a kept book without following a symlink: a kept path later replaced by one (pointing at
 * any other file) is refused, not read. Only a regular file is returned.
 */
async function openKept(path: string): Promise<FileHandle | 'denied' | 'missing'> {
  let handle: FileHandle
  try {
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'ENOENT' ? 'missing' : 'denied'
  }
  if ((await handle.stat()).isFile()) return handle
  await handle.close()
  return 'denied'
}

/** A kept book's MD5 in hex, as Drive's md5Checksum; null if not kept or unreadable. */
export async function md5Kept(grants: Grants, path: unknown): Promise<string | null> {
  const clean = keptPath(grants, path)
  if (!clean) return null
  const handle = await openKept(clean)
  if (typeof handle === 'string') return null
  const hash = createHash('md5')
  try {
    for await (const chunk of handle.createReadStream()) hash.update(chunk as Buffer)
    return hash.digest('hex')
  } catch {
    return null
  } finally {
    await handle.close().catch(() => undefined)
  }
}

/** A kept book's bytes. `denied` for anything not kept; `missing` when it is no longer there. */
export async function readKept(grants: Grants, path: unknown): Promise<DesktopReadResult> {
  const clean = keptPath(grants, path)
  if (!clean) return { ok: false, reason: 'denied' }
  const handle = await openKept(clean)
  if (typeof handle === 'string') return { ok: false, reason: handle }
  try {
    const buf = await handle.readFile()
    const bytes = new Uint8Array(new ArrayBuffer(buf.byteLength))
    bytes.set(buf)
    return { ok: true, bytes }
  } catch {
    return { ok: false, reason: 'missing' }
  } finally {
    await handle.close().catch(() => undefined)
  }
}
