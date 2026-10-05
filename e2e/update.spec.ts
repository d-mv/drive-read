import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { extname, join, normalize } from 'node:path'

import { expect, type Page, test } from '@playwright/test'

import { CSP } from '../csp'

/**
 * The real update flow: serve build v1.0.0, publish v2.0.0 into the same place, and check the
 * service worker offers it without reloading, then reloads into it with the book and position
 * intact. A tiny static server reads from disk on every request (vite preview caches its file list).
 */
test.skip(({ isMobile }) => isMobile, 'one browser is enough for the service-worker flow')
test.describe.configure({ mode: 'serial' })

/** Set once the server listens on a free port (parallel workers never collide). */
let BASE = ''
const work = mkdtempSync(join(tmpdir(), 'drive-read-update-'))
const live = join(work, 'live')

const TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
  '.json': 'application/json',
}

function build(version: string, outDir: string) {
  execFileSync('bunx', ['vite', 'build', '--outDir', outDir, '--emptyOutDir'], {
    env: { ...process.env, DR_APP_VERSION: version, VITE_LOGGER_INGEST_KEY: '' },
    stdio: 'ignore',
  })
}

function publish(outDir: string) {
  rmSync(live, { recursive: true, force: true })
  cpSync(outDir, live, { recursive: true })
}

let server: Server

test.beforeAll(async () => {
  build('1.0.0', join(work, 'v1'))
  build('2.0.0', join(work, 'v2'))
  server = createServer((req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname))
    let file = join(live, path)
    if (!file.startsWith(live) || !existsSync(file) || statSync(file).isDirectory())
      file = join(live, 'index.html') // SPA fallback
    const noCache = /(index\.html|sw\.js)$/.test(file)
    res.writeHead(200, {
      'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
      'content-security-policy': CSP,
      'cache-control': noCache ? 'no-cache' : 'public, max-age=31536000, immutable',
    })
    res.end(readFileSync(file))
  })
  await new Promise<void>((r) => server.listen(0, 'localhost', r))
  const address = server.address()
  BASE = `http://localhost:${typeof address === 'object' && address ? address.port : 0}`
})

test.afterAll(() => {
  server?.close()
  rmSync(work, { recursive: true, force: true })
})

const percent = async (page: Page) =>
  Number(
    await page.getByRole('progressbar', { name: 'Reading progress' }).getAttribute('aria-valuenow'),
  )

test('a new version is offered without interrupting the book, then loads with it intact', async ({
  page,
}) => {
  publish(join(work, 'v1'))
  await page.goto(`${BASE}/`)
  // The first visit installs the worker; a reload puts the page under its control.
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
  })
  await page.reload()
  await page.waitForFunction(() => !!navigator.serviceWorker.controller)

  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Open a file from this device' }).click()
  await (await chooser).setFiles('e2e/fixtures/test-voyage.epub')
  await expect(page.getByText('01 / 04')).toBeVisible()
  for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowRight')
  await expect.poll(() => percent(page)).toBeGreaterThan(0)
  const position = await percent(page)
  const bookUrl = page.url()

  publish(join(work, 'v2'))
  await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.update())

  const toast = page.getByRole('status').filter({ hasText: 'A new version is ready.' })
  await expect(toast).toBeVisible({ timeout: 15_000 })
  // Nothing reloaded under the reader.
  expect(page.url()).toBe(bookUrl)
  expect(await percent(page)).toBe(position)

  await toast.getByRole('button', { name: 'Reload' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Updated to v2.0.0.' })).toBeVisible()
  expect(page.url()).toBe(bookUrl)
  await expect.poll(() => percent(page)).toBe(position)

  await page.getByRole('button', { name: 'Back to library' }).click()
  await expect(page.getByText('Drive Read v2.0.0')).toBeVisible()
})

test('an update found more than a minute after start still reloads on one tap', async ({
  page,
}) => {
  // workbox-window treats updates found >60 s after register() as "external" (the phone case:
  // the app was open for minutes when a visibility check found the update).
  publish(join(work, 'v1'))
  await page.clock.install()
  await page.goto(`${BASE}/`)
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
  })
  await page.reload()
  await page.waitForFunction(() => !!navigator.serviceWorker.controller)
  await expect(
    page.getByRole('heading', { name: 'Read the books in your Google Drive' }),
  ).toBeVisible()

  await page.clock.fastForward('01:05')
  publish(join(work, 'v2'))
  await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.update())
  const toast = page.getByRole('status').filter({ hasText: 'A new version is ready.' })
  await expect(toast).toBeVisible({ timeout: 15_000 })

  await toast.getByRole('button', { name: 'Reload' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Updated to v2.0.0.' })).toBeVisible({
    timeout: 10_000,
  })
})
