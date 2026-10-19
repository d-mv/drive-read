/**
 * Phase 0 acceptance: the web build in Electron over app:// opens EPUB and PDF, keeps books and
 * positions across a restart (IndexedDB + OPFS), and raises no CSP violation.
 * Run: bun spikes/desktop/build.ts && bunx playwright test -c spikes/desktop
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  _electron as electron,
  type ElectronApplication,
  expect,
  type Page,
  test,
} from '@playwright/test'

const MAIN = 'spikes/desktop/out/main.mjs'
const EPUB = 'e2e/fixtures/test-voyage.epub'
const PDF = 'e2e/fixtures/test-manual.pdf'

const userData = mkdtempSync(join(tmpdir(), 'dr-desktop-spike-'))
const messages: string[] = []

async function launch(): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await electron.launch({
    args: [MAIN],
    env: { ...process.env, DR_USER_DATA: userData },
  })
  const page = await app.firstWindow()
  page.on('console', (m) => messages.push(`${m.type()}: ${m.text()}`))
  page.on('pageerror', (e) => messages.push(`pageerror: ${e.message}`))
  return { app, page }
}

async function openFile(page: Page, path: string) {
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Open a file from this device' }).first().click()
  await (await chooser).setFiles(path)
}

const percent = async (page: Page) =>
  Number(
    await page.getByRole('progressbar', { name: 'Reading progress' }).getAttribute('aria-valuenow'),
  )

test.afterAll(() => {
  console.log(`console during the spike:\n${messages.join('\n') || '(none)'}`)
  rmSync(userData, { recursive: true, force: true })
})

test('web build runs in Electron over app://', async () => {
  let { app, page } = await launch()
  expect(page.url()).toMatch(/^app:\/\/drive-read\//)

  // EPUB opens and pages turn.
  await openFile(page, EPUB)
  await expect(page).toHaveURL(/\/read\/local-[0-9a-f]{32}$/)
  await expect(page.getByText('01 / 04')).toBeVisible()
  const start = await percent(page)
  for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowRight')
  await expect.poll(() => percent(page)).toBeGreaterThan(start)
  const before = await percent(page)
  const bookUrl = page.url()

  // Restart: the book and its position survive (IndexedDB + OPFS on app://).
  await page.waitForTimeout(500)
  await app.close()
  ;({ app, page } = await launch())
  await page.goto(bookUrl)
  await expect(page.getByText('01 / 04')).toBeVisible()
  await expect.poll(() => percent(page)).toBe(before)

  // PDF opens with pdf.js, its worker and WebAssembly decoders.
  await page.goto('app://drive-read/')
  await openFile(page, PDF)
  // From the library an import only adds the book; open it from its card.
  await page.getByRole('link', { name: /The Test Manual/ }).click()
  await expect(page.getByText('Page 1 of 6', { exact: true })).toBeVisible()

  await app.close()
  expect(messages.filter((m) => /Content Security Policy/i.test(m))).toEqual([])
})
