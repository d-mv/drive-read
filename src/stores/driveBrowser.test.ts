import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import type { DriveFile } from '@/services/drive/client'

import { useAuth } from './auth'
import { useDriveBrowser } from './driveBrowser'
import { useLibrary } from './library'
import { Err, Ok, setupServices } from './test-services'

const FOLDER = 'application/vnd.google-apps.folder'
const f = (id: string, name: string, mimeType = 'application/epub+zip'): DriveFile => ({
  id,
  name,
  mimeType,
  size: 1048576,
  md5: null,
  modifiedTime: '',
})

beforeEach(() => {
  setActivePinia(createPinia())
  sessionStorage.clear()
  localStorage.clear()
})

async function connected() {
  const ctx = await setupServices()
  ctx.gis.requestToken.mockResolvedValue(
    Ok({ accessToken: 'tok', expiresAt: Date.now() + 3_600_000 }),
  )
  await useAuth().connect()
  return ctx
}

describe('all books', () => {
  it('searches Drive and marks books already in the library', async () => {
    const { drive } = await connected()
    await useLibrary().addFromDrive([f('a', 'Middlemarch - George Eliot.epub')])
    drive.searchBooks.mockResolvedValue(
      Ok([f('a', 'Middlemarch - George Eliot.epub'), f('b', 'Romola - George Eliot.epub')]),
    )
    const browser = useDriveBrowser()
    await browser.search('eliot')

    expect(drive.searchBooks).toHaveBeenCalledWith('tok', 'eliot')
    expect(browser.status).toEqual({ kind: 'ready' })
    expect(browser.books.map((b) => [b.id, b.title, b.author, b.inLibrary])).toEqual([
      ['a', 'Middlemarch', 'George Eliot', true],
      ['b', 'Romola', 'George Eliot', false],
    ])
  })

  it('needs a connection first', async () => {
    const { drive } = await setupServices()
    const browser = useDriveBrowser()
    await browser.search('')
    expect(browser.status).toEqual({ kind: 'reconnect' })
    expect(drive.searchBooks).not.toHaveBeenCalled()
  })

  it('a 401 marks auth expired and asks to reconnect', async () => {
    const { drive } = await connected()
    drive.searchBooks.mockResolvedValue(Err({ kind: 'auth-expired' }))
    const browser = useDriveBrowser()
    await browser.search('')
    expect(browser.status).toEqual({ kind: 'reconnect' })
    expect(useAuth().status).toBe('expired')
  })

  it('reports other errors', async () => {
    const { drive } = await connected()
    drive.searchBooks.mockResolvedValue(Err({ kind: 'offline' }))
    const browser = useDriveBrowser()
    await browser.search('')
    expect(browser.status).toEqual({ kind: 'error', error: { kind: 'offline' } })
  })
})

describe('selection', () => {
  it('adds the selected books and clears the selection', async () => {
    const { drive } = await connected()
    drive.searchBooks.mockResolvedValue(Ok([f('a', 'A.epub'), f('b', 'B.epub'), f('c', 'C.epub')]))
    const browser = useDriveBrowser()
    await browser.search('')
    browser.toggle('a')
    browser.toggle('c')
    expect(browser.selectedCount).toBe(2)
    expect(browser.selectedBytes).toBe(2 * 1048576)

    const message = await browser.addSelected()
    expect(message).toBe('Added 2 books.')
    expect(
      useLibrary()
        .books.map((b) => b.id)
        .sort(),
    ).toEqual(['a', 'c'])
    expect(browser.selectedCount).toBe(0)
    expect(browser.books.filter((b) => b.inLibrary).map((b) => b.id)).toEqual(['a', 'c'])
  })

  it('cannot select books already in the library or PDFs', async () => {
    const { drive } = await connected()
    await useLibrary().addFromDrive([f('a', 'A.epub')])
    drive.searchBooks.mockResolvedValue(Ok([f('a', 'A.epub'), f('p', 'P.pdf', 'application/pdf')]))
    const browser = useDriveBrowser()
    await browser.search('')
    browser.toggle('a')
    browser.toggle('p')
    expect(browser.selectedCount).toBe(0)
  })
})

describe('folders', () => {
  it('opens folders and keeps a breadcrumb trail', async () => {
    const { drive } = await connected()
    drive.listChildren.mockImplementation(async (_t, id) =>
      Ok(
        id === 'root'
          ? [f('books', 'books', FOLDER)]
          : [f('eliot', 'eliot,-george', FOLDER), f('x', 'X.epub')],
      ),
    )
    const browser = useDriveBrowser()
    await browser.openFolder('root', 'My Drive')
    await browser.openFolder('books', 'books')
    expect(browser.trail.map((t) => t.name)).toEqual(['My Drive', 'books'])
    expect(browser.folders.map((x) => [x.id, x.label])).toEqual([['eliot', 'George Eliot']])
    expect(browser.books.map((b) => b.id)).toEqual(['x'])

    await browser.openFolder('root', 'My Drive')
    expect(browser.trail.map((t) => t.name)).toEqual(['My Drive'])
  })

  it('adds every EPUB under a folder, at any depth', async () => {
    const { drive } = await connected()
    drive.listBooksRecursive.mockResolvedValue(
      Ok({
        books: [f('a', 'A.epub'), f('b', 'B.epub'), f('p', 'P.pdf', 'application/pdf')],
        truncated: false,
      }),
    )
    const message = await useDriveBrowser().addFolder('books')
    expect(drive.listBooksRecursive).toHaveBeenCalledWith('tok', 'books')
    expect(message).toBe('Added 2 books. 1 PDF skipped: PDF support comes later.')
    expect(useLibrary().books).toHaveLength(2)
  })

  it('says when a very large folder was cut short', async () => {
    const { drive } = await connected()
    drive.listBooksRecursive.mockResolvedValue(Ok({ books: [f('a', 'A.epub')], truncated: true }))
    expect(await useDriveBrowser().addFolder('books')).toBe(
      'Added 1 book. The folder is very large; add its subfolders separately for the rest.',
    )
  })
})

describe('responses that arrive late', () => {
  function deferred<T>() {
    let resolve!: (v: T) => void
    const promise = new Promise<T>((r) => (resolve = r))
    return { promise, resolve }
  }

  it('a slow all-books search does not overwrite the folder opened after it', async () => {
    const { drive } = await connected()
    const slow = deferred<Awaited<ReturnType<typeof drive.searchBooks>>>()
    drive.searchBooks.mockReturnValue(slow.promise)
    drive.listChildren.mockResolvedValue(Ok([f('eliot', 'eliot,-george', FOLDER)]))

    const browser = useDriveBrowser()
    const searching = browser.search('')
    await browser.openFolder('books', 'books')
    slow.resolve(Ok([f('a', 'A.epub'), f('b', 'B.epub')]))
    await searching

    expect(browser.folders.map((x) => x.id)).toEqual(['eliot'])
    expect(browser.books).toEqual([])
    expect(browser.status).toEqual({ kind: 'ready' })
  })

  it('a slow folder does not overwrite the folder clicked after it', async () => {
    const { drive } = await connected()
    const slow = deferred<Awaited<ReturnType<typeof drive.listChildren>>>()
    drive.listChildren.mockImplementation(async (_t, id) =>
      id === 'stocks' ? slow.promise : Ok([f('x', 'X.epub')]),
    )
    const browser = useDriveBrowser()
    const first = browser.openFolder('stocks', 'Stocks')
    await browser.openFolder('books', 'books')
    slow.resolve(Ok([f('y', 'Y.epub')]))
    await first

    expect(browser.books.map((b) => b.id)).toEqual(['x'])
  })
})
