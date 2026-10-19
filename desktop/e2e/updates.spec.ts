import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { _electron as electron, type ElectronApplication, expect, test } from '@playwright/test'

const MAIN = resolve('desktop/out/main.mjs')
const EPUB = resolve('e2e/fixtures/test-voyage.epub')

let root: string
let server: Server
let published: unknown
let app: ElectronApplication | undefined

test.beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'dr-updates-'))
  server = createServer((_req, res) => {
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify(published))
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
})

test.afterEach(async () => {
  await app?.close()
  app = undefined
  server.close()
  await rm(root, { recursive: true, force: true })
})

async function launchWithBook() {
  const { port } = server.address() as AddressInfo
  app = await electron.launch({
    args: [MAIN, EPUB],
    env: {
      ...process.env,
      DR_USER_DATA: join(root, 'profile'),
      DR_VERSION_URL: `http://127.0.0.1:${port}/desktop-version.json`,
    },
  })
  const page = await app.firstWindow()
  await expect(page).toHaveURL(/\/read\//)
  await page.goto('app://drive-read/')
  await expect(page.getByRole('heading', { name: 'Library' })).toBeVisible()
  return page
}

test('a newer published version is offered, and Download opens the browser', async () => {
  published = { v: 1, version: '99.0.0', url: 'https://example.com/Drive-Read-99.0.0.dmg' }
  const page = await launchWithBook()
  // The check runs at start; reload so it has certainly answered.
  await page.reload()
  const notice = page.getByRole('status').filter({ hasText: 'Drive Read 99.0.0 is available.' })
  await expect(notice).toBeVisible()

  await app!.evaluate(({ shell }) => {
    const opened: string[] = []
    ;(globalThis as { opened?: string[] }).opened = opened
    shell.openExternal = async (url: string) => {
      opened.push(url)
    }
  })
  await notice.getByRole('button', { name: 'Download' }).click()
  await expect
    .poll(() => app!.evaluate(() => (globalThis as { opened?: string[] }).opened))
    .toEqual(['https://example.com/Drive-Read-99.0.0.dmg'])
})

test('the same version offers nothing', async () => {
  const { version } = JSON.parse(
    (await import('node:fs')).readFileSync('package.json', 'utf8'),
  ) as { version: string }
  published = { v: 1, version, url: 'https://example.com/a.dmg' }
  const page = await launchWithBook()
  await page.reload()
  await page.waitForTimeout(500)
  await expect(page.getByText('is available.')).toBeHidden()
})
