// @vitest-environment node
import { mkdtemp, readFile, rm, symlink, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { keepFile, loadGrants, md5Kept, readKept } from './files'

let dir: string
let grantsFile: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'dr-files-'))
  grantsFile = join(dir, 'kept-files.json')
})
afterEach(() => rm(dir, { recursive: true, force: true }))

async function book(name: string, body = 'book-bytes') {
  const path = join(dir, name)
  await writeFile(path, body)
  return path
}

describe('keepFile', () => {
  it('keeps an EPUB or PDF on disk and remembers it across restarts', async () => {
    const path = await book('a.epub')
    const grants = await loadGrants(grantsFile)
    expect(await keepFile(grants, path)).toBe(path)

    const again = await loadGrants(grantsFile)
    expect(again.has(path)).toBe(true)
  })

  it.each([
    ['a relative path', 'a.epub'],
    ['another file type', '/etc/hosts'],
    ['a non-string', 42],
    ['an empty path (not a file on disk)', ''],
  ])('refuses %s', async (_, path) => {
    const grants = await loadGrants(grantsFile)
    expect(await keepFile(grants, path)).toBeNull()
  })

  it.each(['b.fb2', 'b.fbz', 'b.fb2.zip', 'B.FB2'])('keeps an FB2 named %s', async (name) => {
    const path = await book(name)
    const grants = await loadGrants(grantsFile)
    expect(await keepFile(grants, path)).toBe(path)
  })

  it('refuses a plain zip', async () => {
    const path = await book('photos.zip')
    const grants = await loadGrants(grantsFile)
    expect(await keepFile(grants, path)).toBeNull()
  })

  it('refuses a book path that does not exist', async () => {
    const grants = await loadGrants(grantsFile)
    expect(await keepFile(grants, join(dir, 'nope.epub'))).toBeNull()
  })

  it('normalises the path it keeps', async () => {
    const path = await book('b.pdf')
    const grants = await loadGrants(grantsFile)
    expect(await keepFile(grants, join(dir, 'x', '..', 'b.pdf'))).toBe(path)
  })
})

describe('readKept', () => {
  it('reads a kept file', async () => {
    const path = await book('a.epub', 'hello')
    const grants = await loadGrants(grantsFile)
    await keepFile(grants, path)
    const r = await readKept(grants, path)
    expect(r.ok && new TextDecoder().decode(r.bytes)).toBe('hello')
  })

  it('denies a file that was never kept, even a book', async () => {
    const path = await book('a.epub')
    const grants = await loadGrants(grantsFile)
    expect(await readKept(grants, path)).toEqual({ ok: false, reason: 'denied' })
    expect(await readKept(grants, '/etc/passwd')).toEqual({ ok: false, reason: 'denied' })
  })

  it('denies a path that only resolves to a kept file through ..', async () => {
    const path = await book('a.epub')
    const grants = await loadGrants(grantsFile)
    await keepFile(grants, path)
    const sneaky = join(dir, 'a.epub', '..', '..', 'etc', 'a.epub')
    expect(await readKept(grants, sneaky)).toEqual({ ok: false, reason: 'denied' })
  })

  it('says missing when a kept file was moved away', async () => {
    const path = await book('a.epub')
    const grants = await loadGrants(grantsFile)
    await keepFile(grants, path)
    await rm(path)
    expect(await readKept(grants, path)).toEqual({ ok: false, reason: 'missing' })
  })
})

describe('loadGrants', () => {
  it('starts empty when the grants file is damaged', async () => {
    await writeFile(grantsFile, '{not json')
    const grants = await loadGrants(grantsFile)
    expect(grants.has('/x.epub')).toBe(false)
    const path = await book('a.epub')
    await keepFile(grants, path)
    expect(JSON.parse(await readFile(grantsFile, 'utf8'))).toEqual({ v: 1, paths: [path] })
  })
})

describe('md5Kept', () => {
  it("gives a kept file's MD5 as Drive writes it, and nothing for others", async () => {
    const path = await book('a.epub', 'hello')
    const grants = await loadGrants(grantsFile)
    expect(await md5Kept(grants, path)).toBeNull()
    await keepFile(grants, path)
    expect(await md5Kept(grants, path)).toBe('5d41402abc4b2a76b9719d911017c592')
    await rm(path)
    expect(await md5Kept(grants, path)).toBeNull()
  })
})

describe('symlinks', () => {
  it('refuses a symlink named as a book, whatever it points at', async () => {
    const secret = await book('notes.txt', 'private')
    const real = await book('real.epub')
    const toSecret = join(dir, 'secret.epub')
    const toBook = join(dir, 'alias.epub')
    await symlink(secret, toSecret)
    await symlink(real, toBook)
    const grants = await loadGrants(grantsFile)
    expect(await keepFile(grants, toSecret)).toBeNull()
    expect(await keepFile(grants, toBook)).toBeNull()
  })

  it('does not follow a kept path that was swapped for a symlink later', async () => {
    const secret = await book('notes.txt', 'private')
    const path = await book('kept.epub')
    const grants = await loadGrants(grantsFile)
    expect(await keepFile(grants, path)).toBe(path)
    await unlink(path)
    await symlink(secret, path)
    expect(await readKept(grants, path)).toEqual({ ok: false, reason: 'denied' })
    expect(await md5Kept(grants, path)).toBeNull()
  })
})
