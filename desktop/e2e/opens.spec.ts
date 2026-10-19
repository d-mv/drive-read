import { spawn } from 'node:child_process'
import { copyFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import {
  _electron as electron,
  type ElectronApplication,
  expect,
  type Page,
  test,
} from '@playwright/test'
import electronPath from 'electron'

const MAIN = resolve('desktop/out/main.mjs')
const EPUB = resolve('e2e/fixtures/test-voyage.epub')
const PDF = resolve('e2e/fixtures/test-manual.pdf')

let root: string
let book: string
let app: ElectronApplication | undefined

test.beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'dr-opens-'))
  book = join(root, 'test-voyage.epub')
  await copyFile(EPUB, book)
})

test.afterEach(async () => {
  await app?.close()
  app = undefined
  await rm(root, { recursive: true, force: true })
})

const env = () => ({ ...process.env, DR_USER_DATA: join(root, 'profile') })

async function launch(...files: string[]): Promise<Page> {
  app = await electron.launch({ args: [MAIN, ...files], env: env() })
  return app.firstWindow()
}

const READER = /\/read\/local-[0-9a-f]{32}$/

test('a book passed at launch opens in place', async () => {
  const page = await launch(book)
  await expect(page).toHaveURL(READER)
  await expect(page.getByText('01 / 04')).toBeVisible()
})

test('a book from Finder (open-file) opens in the running app', async () => {
  const page = await launch()
  await expect(page.getByRole('button', { name: 'Open a file from this device' })).toBeVisible()
  await app!.evaluate(({ app }, path) => {
    app.emit('open-file', { preventDefault() {} }, path)
  }, book)
  await expect(page).toHaveURL(READER)
  await expect(page.getByText('01 / 04')).toBeVisible()
})

test('a second launch hands its book to the running app', async () => {
  const page = await launch()
  await expect(page.getByRole('button', { name: 'Open a file from this device' })).toBeVisible()
  const second = spawn(electronPath as unknown as string, [MAIN, book], { env: env() })
  const exited = new Promise<number | null>((r) => second.on('exit', r))
  await expect(page).toHaveURL(READER)
  expect(await exited).toBe(0)
})

test('a path that is not there is ignored, and the next book still opens', async () => {
  const page = await launch()
  await app!.evaluate(
    ({ app }, path) => {
      app.emit('open-file', { preventDefault() {} }, path)
    },
    join(root, 'gone.epub'),
  )
  // A path that does not exist is refused by main and never reaches the page.
  await page.waitForTimeout(300)
  await expect(page).not.toHaveURL(READER)

  await app!.evaluate(({ app }, path) => {
    app.emit('open-file', { preventDefault() {} }, path)
  }, PDF)
  await expect(page).toHaveURL(READER)
})

test('File › Open… opens the chosen book', async () => {
  const page = await launch()
  await expect(page.getByRole('button', { name: 'Open a file from this device' })).toBeVisible()
  const chooser = page.waitForEvent('filechooser')
  await app!.evaluate(({ Menu }) => {
    const file = Menu.getApplicationMenu()!.items.find((i) => i.label === 'File')!
    file.submenu!.items.find((i) => i.label === 'Open…')!.click()
  })
  await (await chooser).setFiles(book)
  await expect(page).toHaveURL(READER)
})

test('a dropped book opens', async () => {
  const page = await launch()
  await expect(page.getByRole('button', { name: 'Open a file from this device' })).toBeVisible()
  const bytes = [...(await import('node:fs')).readFileSync(EPUB)]
  const dt = await page.evaluateHandle((data) => {
    const dt = new DataTransfer()
    dt.items.add(new File([new Uint8Array(data)], 'test-voyage.epub'))
    return dt
  }, bytes)
  await page.dispatchEvent('body', 'drop', { dataTransfer: dt })
  await expect(page).toHaveURL(READER)
})

test('the EPUB default-app hint shows once, until dismissed', async () => {
  let page = await launch()
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Open a file from this device' }).first().click()
  await (await chooser).setFiles(book)
  await expect(page).toHaveURL(READER)
  await page.goto('app://drive-read/')
  const hint = page.getByRole('status').filter({ hasText: 'Change All' })
  await expect(hint).toBeVisible()
  await hint.getByRole('button', { name: 'Dismiss' }).click()
  await expect(hint).toBeHidden()

  await app!.close()
  page = await launch()
  await expect(page.getByRole('heading', { name: 'Library' })).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: 'Change All' })).toBeHidden()
})

test('no hint once an EPUB came from Finder', async () => {
  const page = await launch(book)
  await expect(page).toHaveURL(READER)
  await page.goto('app://drive-read/')
  await expect(page.getByRole('heading', { name: 'Library' })).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: 'Change All' })).toBeHidden()
})
