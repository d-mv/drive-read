import { expect, type Page, test } from '@playwright/test'

const FB2 = 'e2e/fixtures/test-flame.fb2'
/** Zipped, windows-1251, and named .epub: how such books often arrive. */
const FBZ_AS_EPUB = 'e2e/fixtures/test-flame-fb2.epub'

async function openBook(page: Page, path: string) {
  await page.goto('/')
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Open a file from this device' }).click()
  await (await chooser).setFiles(path)
  await expect(page).toHaveURL(/\/read\/local-[0-9a-f]{32}$/)
}

const percent = async (page: Page) =>
  Number(
    await page.getByRole('progressbar', { name: 'Reading progress' }).getAttribute('aria-valuenow'),
  )

test('opens an FB2 with its title, author and chapters', async ({ page }) => {
  await openBook(page, FB2)
  await expect(page.locator('header').getByText('Тестовое пламя')).toBeVisible()
  await expect(page.getByText('01 / 03')).toBeVisible()
  await page.getByRole('button', { name: 'Contents', exact: true }).click()
  await expect(
    page
      .getByRole('complementary', { name: 'Contents' })
      .getByRole('button', { name: /Глава третья/ }),
  ).toBeVisible()
})

test('opens a zipped windows-1251 FB2 that is named .epub', async ({ page }) => {
  await openBook(page, FBZ_AS_EPUB)
  await expect(page.locator('header').getByText('Тестовое пламя')).toBeVisible()
  await expect(page.getByText('01 / 03')).toBeVisible()
})

test('an FB2 keeps its place after a reload', async ({ page, isMobile }) => {
  test.skip(isMobile, 'keyboard paging is a desktop path')
  await openBook(page, FB2)
  await expect(page.getByText('01 / 03')).toBeVisible()
  for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight')
  await expect.poll(() => percent(page)).toBeGreaterThan(0)
  const before = await percent(page)
  await page.reload()
  await expect.poll(() => percent(page)).toBe(before)
})
