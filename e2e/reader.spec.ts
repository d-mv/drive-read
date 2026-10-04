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
  await panel.getByRole('group', { name: 'Theme' }).getByRole('button', { name: 'Dark' }).click()
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

test('removing the last book returns to the welcome screen', async ({ page }) => {
  await addBook(page)
  await page.getByRole('button', { name: 'Back to library' }).click()
  page.once('dialog', (d) => d.accept())
  await page.getByRole('button', { name: 'Remove The Test Voyage' }).first().click()
  await expect(
    page.getByRole('heading', { name: 'Read the books in your Google Drive' }),
  ).toBeVisible()
})
