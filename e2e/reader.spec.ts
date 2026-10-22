import { expect, type Page, test } from '@playwright/test'

const EPUB = 'e2e/fixtures/test-voyage.epub'

async function addBook(page: Page) {
  await page.goto('/')
  await expect(
    page.getByRole('heading', { name: 'Read the books in your Google Drive' }),
  ).toBeVisible()
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Open a file from this device' }).click()
  await (await chooser).setFiles(EPUB)
  await expect(page).toHaveURL(/\/read\/local-[0-9a-f]{32}$/)
  await expect(page.getByRole('progressbar', { name: 'Reading progress' })).toBeVisible()
  await expect(page.getByText('01 / 04')).toBeVisible()
}

const percent = async (page: Page) =>
  Number(
    await page.getByRole('progressbar', { name: 'Reading progress' }).getAttribute('aria-valuenow'),
  )

test('opens a local EPUB from the first-run screen', async ({ page }) => {
  await addBook(page)
  await expect(page.locator('header').getByText('The Test Voyage')).toBeVisible()
  await expect(page.locator('[data-segment]')).toHaveCount(4)
})

test('turns pages and restores the position after a reload', async ({ page, isMobile }) => {
  test.skip(isMobile, 'keyboard paging is a desktop path; the phone pages by swipe')
  await addBook(page)
  const start = await percent(page)
  for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowRight')
  await expect.poll(() => percent(page)).toBeGreaterThan(start)
  const before = await percent(page)

  await page.reload()
  await expect(page.getByText('01 / 04')).toBeVisible()
  await expect.poll(() => percent(page)).toBe(before)
})

test('jumps to a chapter from the contents and comes back to it', async ({ page }) => {
  await addBook(page)
  await page.getByRole('button', { name: 'Contents', exact: true }).click()
  await page
    .getByRole('complementary', { name: 'Contents' })
    .getByRole('button', { name: /Signals/ })
    .click()
  await expect(page.getByText('03 / 04')).toBeVisible()

  await page.reload()
  await expect(page.getByText('03 / 04')).toBeVisible()
})

test('follows a footnote and comes back to the text', async ({ page }) => {
  await addBook(page)
  // The book frame sits in foliate's closed shadow root, so find it among the page's frames.
  // The column layout puts the link outside Playwright's idea of the viewport: dispatch the click.
  const noteref = page.frames().map((f) => f.locator('a[href$="#note-1"]'))
  await expect
    .poll(async () => (await Promise.all(noteref.map((l) => l.count()))).indexOf(1))
    .not.toBe(-1)
  const counts = await Promise.all(noteref.map((l) => l.count()))
  await noteref[counts.indexOf(1)].dispatchEvent('click')
  await expect(page.getByText('04 / 04')).toBeVisible()

  await page.getByRole('button', { name: 'Back to text' }).click()
  await expect(page.getByText('01 / 04')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Back to text' })).toBeHidden()
})

test('a web link in the book opens without a handle on the reader tab', async ({ page }) => {
  await page
    .context()
    .route('https://example.test/**', (r) =>
      r.fulfill({ contentType: 'text/html', body: '<title>away</title>' }),
    )
  await addBook(page)
  const links = page.frames().map((f) => f.locator('#ext-web'))
  await expect
    .poll(async () => (await Promise.all(links.map((l) => l.count()))).indexOf(1))
    .not.toBe(-1)
  const counts = await Promise.all(links.map((l) => l.count()))
  const popup = page.waitForEvent('popup')
  await links[counts.indexOf(1)].dispatchEvent('click')
  const away = await popup
  await expect(away).toHaveURL('https://example.test/away')
  expect(await away.evaluate(() => window.opener)).toBeNull()
})

test('a javascript: link in the book opens nothing', async ({ page }) => {
  await addBook(page)
  const links = page.frames().map((f) => f.locator('#ext-js'))
  await expect
    .poll(async () => (await Promise.all(links.map((l) => l.count()))).indexOf(1))
    .not.toBe(-1)
  const counts = await Promise.all(links.map((l) => l.count()))
  let popups = 0
  page.on('popup', () => popups++)
  await links[counts.indexOf(1)].dispatchEvent('click')
  // Give a popup, if any, time to open.
  await page.waitForTimeout(500)
  expect(popups).toBe(0)
  expect(await page.evaluate(() => document.documentElement.dataset.pwned)).toBeUndefined()
})

test('a script inside the book does not run', async ({ page }) => {
  const violations: string[] = []
  page.on('console', (m) => {
    if (/Content Security Policy/i.test(m.text())) violations.push(m.text())
  })
  await addBook(page)
  await page.getByRole('button', { name: 'Contents', exact: true }).click()
  await page
    .getByRole('complementary', { name: 'Contents' })
    .getByRole('button', { name: /Signals/ })
    .click()
  await expect(page.getByText('03 / 04')).toBeVisible()

  expect(await page.evaluate(() => document.documentElement.dataset.pwned)).toBeUndefined()
  // The blocked book script is the only CSP violation allowed.
  expect(violations.every((v) => /script-src/.test(v))).toBe(true)
})

test('text settings change the book and persist', async ({ page }) => {
  await addBook(page)
  await page.getByRole('button', { name: 'Text settings' }).click()
  const panel = page.getByRole('region', { name: 'Text settings' })
  await panel.getByRole('button', { name: 'Larger text' }).click()
  await expect(panel.getByText('20 px')).toBeVisible()
  await panel
    .getByRole('group', { name: 'Theme' })
    .getByRole('button', { name: 'Dark', exact: true })
    .click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')

  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.getByRole('button', { name: 'Text settings' }).click()
  await expect(page.getByRole('region', { name: 'Text settings' }).getByText('20 px')).toBeVisible()
})

test('the library lists the book and resumes it', async ({ page, isMobile }) => {
  test.skip(isMobile, 'keyboard paging is a desktop path')
  await addBook(page)
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight')
  await page.getByRole('button', { name: 'Back to library' }).click()

  await expect(page.getByRole('heading', { name: 'Library' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Continue reading' })).toContainText(
    'The Test Voyage',
  )
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/read\//)
})

test('on a phone the small Continue cover shows the title only', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'the 64 px cover is the phone layout')
  await addBook(page)
  await page.getByRole('button', { name: 'Back to library' }).click()
  const cover = page.getByRole('region', { name: 'Continue reading' }).locator('[aria-hidden]')
  await expect(cover.getByText('The Test Voyage')).toBeVisible()
  await expect(cover.getByText('Ada Fixture')).toBeHidden()
  // The author is still shown once, beside the cover.
  await expect(
    page.getByRole('region', { name: 'Continue reading' }).getByText('Ada Fixture'),
  ).toHaveCount(2)
})

test('removing the last book returns to the welcome screen', async ({ page }) => {
  await addBook(page)
  await page.getByRole('button', { name: 'Back to library' }).click()
  page.once('dialog', (d) => d.accept())
  await page.getByRole('button', { name: 'Remove The Test Voyage' }).first().click()
  await expect(
    page.getByRole('heading', { name: 'Read the books in your Google Drive' }),
  ).toBeVisible()
})
