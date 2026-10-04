import { expect, type Page, test } from '@playwright/test'

import { fakeGoogle } from './fake-google'

async function connect(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Connect Google Drive' }).click()
  await expect(page).toHaveURL(/\/drive$/)
  await expect(page.getByRole('heading', { name: 'Add from Drive' })).toBeVisible()
}

const row = (page: Page, title: string) => page.getByRole('listitem').filter({ hasText: title })

test('connects, adds a book from all books, downloads it on first open', async ({ page }) => {
  const google = await fakeGoogle(page)
  await connect(page)

  await expect(row(page, 'The Test Voyage')).toContainText('Ada Fixture')
  await expect(row(page, 'Ship Notes')).toContainText('PDF later')
  await page.getByRole('checkbox', { name: 'Select The Test Voyage' }).check()
  await page.getByRole('button', { name: 'Add 1 book' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Added 1 book.' })).toBeVisible()
  await expect(row(page, 'The Test Voyage')).toContainText('In library')

  await page.getByRole('button', { name: 'Back to library' }).click()
  await expect(page.getByText('Drive only').filter({ visible: true }).first()).toBeVisible()
  expect(google.downloads).toEqual([])

  await page
    .getByRole('link', { name: /The Test Voyage/ })
    .first()
    .click()
  await expect(page.getByText('01 / 04')).toBeVisible()
  expect(google.downloads).toEqual(['voyage'])

  // Real metadata replaces the file-name guess; reopening uses the stored copy.
  await page.getByRole('button', { name: 'Back to library' }).click()
  await expect(page.getByText('Drive only')).toHaveCount(0)
  await page
    .getByRole('link', { name: /The Test Voyage/ })
    .first()
    .click()
  await expect(page.getByText('01 / 04')).toBeVisible()
  expect(google.downloads).toEqual(['voyage'])
})

test('searches Drive by name', async ({ page }) => {
  await fakeGoogle(page)
  await connect(page)
  await page.getByRole('searchbox', { name: 'Search books in your Drive' }).fill('second')
  await expect(row(page, 'Second Voyage')).toBeVisible()
  await expect(row(page, 'The Test Voyage')).toHaveCount(0)
})

test('browses folders and adds everything under one, at any depth', async ({ page }) => {
  await fakeGoogle(page)
  await connect(page)
  await page.getByRole('button', { name: 'Folders' }).click()
  await page.getByRole('button', { name: 'Stocks', exact: true }).click()
  await page.getByRole('button', { name: 'books', exact: true }).click()
  await expect(page.getByRole('button', { name: /^Ada Fixture/ })).toBeVisible()
  await expect(page.getByText('fixture,-ada')).toBeVisible()

  await page.getByRole('button', { name: 'Add everything in this folder' }).click()
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: 'Added 2 books. 1 PDF skipped: PDF support comes later.' }),
  ).toBeVisible()

  await page
    .getByRole('navigation', { name: 'Folder path' })
    .getByRole('button', { name: 'My Drive' })
    .click()
  await expect(page.getByRole('button', { name: 'Stocks', exact: true })).toBeVisible()
})

test('an expired token asks to reconnect, then the download continues', async ({ page }) => {
  const google = await fakeGoogle(page)
  await connect(page)
  await page.getByRole('checkbox', { name: 'Select The Test Voyage' }).check()
  await page.getByRole('button', { name: 'Add 1 book' }).click()
  await page.getByRole('button', { name: 'Back to library' }).click()

  google.downloadStatus = 401
  await page
    .getByRole('link', { name: /The Test Voyage/ })
    .first()
    .click()
  await expect(page.getByRole('alert')).toContainText('Reconnect Drive to download it')

  google.downloadStatus = 200
  await page.getByRole('button', { name: 'Reconnect Drive' }).click()
  await expect(page.getByText('01 / 04')).toBeVisible()
})

test('a book deleted from Drive says so and can be removed', async ({ page }) => {
  const google = await fakeGoogle(page)
  await connect(page)
  await page.getByRole('checkbox', { name: 'Select The Test Voyage' }).check()
  await page.getByRole('button', { name: 'Add 1 book' }).click()
  await page.getByRole('button', { name: 'Back to library' }).click()

  google.downloadStatus = 404
  await page
    .getByRole('link', { name: /The Test Voyage/ })
    .first()
    .click()
  await expect(page.getByRole('alert')).toContainText('Missing in Drive')
  await page.getByRole('button', { name: 'Remove book' }).click()
  await expect(
    page.getByRole('heading', { name: 'Read the books in your Google Drive' }),
  ).toBeVisible()
})
