import { copyFile, mkdir, mkdtemp, rename, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import {
  _electron as electron,
  type ElectronApplication,
  expect,
  type Page,
  test,
} from '@playwright/test'

const MAIN = resolve('desktop/out/main.mjs')
const EPUB = resolve('e2e/fixtures/test-voyage.epub')

let root: string
let books: string
let userData: string
let app: ElectronApplication | undefined

test.beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'dr-desktop-'))
  books = join(root, 'Books')
  userData = join(root, 'profile')
  await mkdir(books)
})

test.afterEach(async () => {
  await app?.close()
  app = undefined
  await rm(root, { recursive: true, force: true })
})

async function launch(): Promise<Page> {
  await app?.close()
  app = await electron.launch({
    args: [MAIN],
    env: { ...process.env, DR_USER_DATA: userData, DR_VERSION_URL: 'http://127.0.0.1:9/' },
  })
  return app.firstWindow()
}

async function openFromFirstRun(page: Page, path: string) {
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Open a file from this device' }).first().click()
  await (await chooser).setFiles(path)
  await expect(page).toHaveURL(/\/read\/local-[0-9a-f]{32}$/)
  await expect(page.getByText('01 / 04')).toBeVisible()
}

/** Names under OPFS books/: the web app copies each local book there; desktop must not. */
const copiedBooks = (page: Page) =>
  page.evaluate(async () => {
    const root = await navigator.storage.getDirectory()
    try {
      const dir = await root.getDirectoryHandle('books')
      const names: string[] = []
      for await (const name of dir.keys()) names.push(name)
      return names
    } catch {
      return []
    }
  })

test('opens a book where it sits and again after a restart', async () => {
  const path = join(books, 'test-voyage.epub')
  await copyFile(EPUB, path)
  let page = await launch()
  await openFromFirstRun(page, path)
  const bookUrl = page.url()
  expect(await copiedBooks(page)).toEqual([])

  page = await launch()
  await page.goto(bookUrl)
  await expect(page.getByText('01 / 04')).toBeVisible()
})

test('a moved file is found again with Locate file…', async () => {
  const path = join(books, 'test-voyage.epub')
  await copyFile(EPUB, path)
  let page = await launch()
  await openFromFirstRun(page, path)
  const bookUrl = page.url()

  const moved = join(root, 'Archive.epub')
  await rename(path, moved)
  page = await launch()
  await page.goto(bookUrl)
  await expect(page.getByRole('alert')).toContainText("isn't where it was")

  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Locate file…' }).click()
  await (await chooser).setFiles(moved)
  await expect(page.getByText('01 / 04')).toBeVisible()
})

test('Locate file… refuses a different book', async () => {
  const path = join(books, 'test-voyage.epub')
  await copyFile(EPUB, path)
  const page = await launch()
  await openFromFirstRun(page, path)
  const bookUrl = page.url()
  await rm(path)
  await page.goto(bookUrl)
  await expect(page.getByRole('alert')).toContainText("isn't where it was")

  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Locate file…' }).click()
  await (await chooser).setFiles(resolve('e2e/fixtures/test-manual.pdf'))
  // The picker offers EPUB only; a PDF set anyway is a different file.
  await expect(page.getByRole('alert')).toContainText("That's a different file")
})

test('the page cannot read a file the user did not choose', async () => {
  const path = join(books, 'test-voyage.epub')
  await copyFile(EPUB, path)
  const page = await launch()
  const result = await page.evaluate(
    async ([book]) => {
      const bridge = window.driveReadDesktop!
      return {
        system: await bridge.read('/etc/hosts'),
        unchosenBook: await bridge.read(book!),
        madeUpFile: await bridge.keep(new File(['x'], 'a.epub')),
      }
    },
    [path],
  )
  expect(result).toEqual({
    system: { ok: false, reason: 'denied' },
    unchosenBook: { ok: false, reason: 'denied' },
    madeUpFile: null,
  })
})
