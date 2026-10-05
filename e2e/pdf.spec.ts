import { expect, type Page, test } from '@playwright/test'

const PDF = 'e2e/fixtures/test-manual.pdf'

async function openPdf(page: Page) {
  await page.goto('/')
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Open a file from this device' }).click()
  await (await chooser).setFiles(PDF)
  await expect(page).toHaveURL(/\/read\/local-/)
  await expect(page.getByText('Page 1 of 6')).toBeVisible()
}

test('opens a PDF with its title, pages and contents', async ({ page }) => {
  const violations: string[] = []
  page.on('console', (m) => {
    if (/Content Security Policy/i.test(m.text())) violations.push(m.text())
  })
  await openPdf(page)
  await expect(page.locator('header').getByText('The Test Manual')).toBeVisible()
  await expect(page.getByRole('img', { name: 'Page 1 of 6' })).toBeVisible()
  await expect(page.locator('[data-segment]')).toHaveCount(3)

  await page.getByRole('button', { name: 'Contents', exact: true }).click()
  await page
    .getByRole('complementary', { name: 'Contents' })
    .getByRole('button', { name: /Part Two/ })
    .click()
  await expect(page.getByText('Page 3 of 6')).toBeVisible()
  await expect(page.getByText('02 / 03')).toBeVisible()
  expect(violations).toEqual([])
})

test('pages forward through the PDF and restores the page after a reload', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'keyboard paging is a desktop path')
  await openPdf(page)
  for (let i = 0; i < 6 && !(await page.getByText('Page 2 of 6').isVisible()); i++) {
    await page.keyboard.press('ArrowRight')
    await page.waitForTimeout(150)
  }
  await expect(page.getByText('Page 2 of 6')).toBeVisible()

  await page.reload()
  await expect(page.getByText('Page 2 of 6')).toBeVisible()
})

test('text settings for a PDF offer only margins and theme', async ({ page }) => {
  await openPdf(page)
  await page.getByRole('button', { name: 'Text settings' }).click()
  const panel = page.getByRole('region', { name: 'Text settings' })
  await expect(panel.getByRole('group', { name: 'Margins' })).toBeVisible()
  await expect(panel.getByRole('group', { name: 'Theme' })).toBeVisible()
  await expect(panel.getByRole('group', { name: 'Typeface' })).toHaveCount(0)
  await expect(panel.getByRole('button', { name: 'Larger text' })).toHaveCount(0)
})

test('the library shows the PDF with its first page as the cover', async ({ page }) => {
  await openPdf(page)
  await page.getByRole('button', { name: 'Back to library' }).click()
  await expect(
    page
      .getByRole('link', { name: /The Test Manual/ })
      .filter({ visible: true })
      .first(),
  ).toBeVisible()
  await expect(page.locator('img[src^="blob:"]').filter({ visible: true }).first()).toBeVisible()
})
