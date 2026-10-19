import { expect, type Page, test } from '@playwright/test'

import { fakeGoogle } from './fake-google'

async function connect(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Connect Google Drive' }).click()
  await expect(page.getByRole('heading', { name: 'Add from Drive' })).toBeVisible()
}

const row = (page: Page, text: string) => page.getByRole('listitem').filter({ hasText: text })

test('a Drive folder lists FB2 books, whatever MIME type they carry, and not other files', async ({
  page,
}) => {
  await fakeGoogle(page)
  await connect(page)
  await page.getByRole('button', { name: 'Русское', exact: true }).click()
  await expect(row(page, 'Тестовое пламя')).toContainText('FB2')
  await expect(row(page, 'Пламя (epub)')).toBeVisible()
  await expect(page.getByText('cover.jpg')).toHaveCount(0)
})

test('search finds an FB2 book in Drive', async ({ page }) => {
  await fakeGoogle(page)
  await connect(page)
  await page.getByRole('searchbox', { name: 'Search books in your Drive' }).fill('пламя')
  await expect(row(page, 'Тестовое пламя')).toBeVisible()
  await expect(page.getByText('cover.jpg')).toHaveCount(0)
})

test('Drive FB2 books download and open, including one misnamed .epub', async ({ page }) => {
  const google = await fakeGoogle(page)
  await connect(page)
  await page.getByRole('button', { name: 'Русское', exact: true }).click()
  await page.getByRole('button', { name: 'Add everything in this folder' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Added 2 books.' })).toBeVisible()
  await page.getByRole('button', { name: 'Back to library' }).click()

  await page
    .getByRole('link', { name: /Тестовое пламя/ })
    .filter({ visible: true })
    .first()
    .click()
  await expect(page.locator('header').getByText('Тестовое пламя')).toBeVisible()
  await expect(page.getByText('01 / 03')).toBeVisible()
  expect(google.downloads).toEqual(['flame'])

  await page.getByRole('button', { name: 'Back to library' }).click()
  await page
    .getByRole('link', { name: /Пламя \(epub\)/ })
    .filter({ visible: true })
    .first()
    .click()
  await expect(page.getByText('01 / 03')).toBeVisible()
  expect(google.downloads).toEqual(['flame', 'flame-zip'])

  // Recorded as FB2 now: it opens again from the device without a fresh download.
  await page.reload()
  await expect(page.getByText('01 / 03')).toBeVisible()
  expect(google.downloads).toEqual(['flame', 'flame-zip'])
})
