/**
 * Which files the app may read, and reading them. Main reads only books the user chose
 * (picker, drag-and-drop, Finder) and that are therefore kept here; never a path the page names.
 */
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readFile, rename, stat, writeFile } from 'node:fs/promises'
import { extname, isAbsolute, normalize } from 'node:path'

import type { DesktopReadResult } from '../src/shared/desktop'

const BOOK_EXT = new Set(['.epub', '.pdf'])

/** An absolute, normalised EPUB or PDF path, or null. */
function bookPath(path: unknown): string | null {
  if (typeof path !== 'string' || !isAbsolute(path)) return null
  const clean = normalize(path)
  return BOOK_EXT.has(extname(clean).toLowerCase()) ? clean : null
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
  const info = await stat(clean).catch(() => null)
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

/** A kept book's MD5 in hex, as Drive's md5Checksum; null if not kept or unreadable. */
export async function md5Kept(grants: Grants, path: unknown): Promise<string | null> {
  const clean = keptPath(grants, path)
  if (!clean) return null
  const hash = createHash('md5')
  try {
    for await (const chunk of createReadStream(clean)) hash.update(chunk as Buffer)
    return hash.digest('hex')
  } catch {
    return null
  }
}

/** A kept book's bytes. `denied` for anything not kept; `missing` when it is no longer there. */
export async function readKept(grants: Grants, path: unknown): Promise<DesktopReadResult> {
  const clean = keptPath(grants, path)
  if (!clean) return { ok: false, reason: 'denied' }
  try {
    const buf = await readFile(clean)
    const bytes = new Uint8Array(new ArrayBuffer(buf.byteLength))
    bytes.set(buf)
    return { ok: true, bytes }
  } catch {
    return { ok: false, reason: 'missing' }
  }
}
