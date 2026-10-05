import { expect, type Page, test } from '@playwright/test'

import { fakeGoogle } from './fake-google'

/** Hardening: failure states from the architecture doc, on the production build + service worker. */
test.skip(({ isMobile }) => isMobile, 'service-worker and network scenarios: one browser is enough')

async function connectAndOpenAuthor(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Connect Google Drive' }).click()
  await page.getByRole('button', { name: 'Stocks', exact: true }).click()
  await page.getByRole('button', { name: 'books', exact: true }).click()
}

const link = (page: Page, title: RegExp) =>
  page.getByRole('link', { name: title }).filter({ visible: true }).first()

test('starts offline from the cache: downloaded books open, the rest say "Not downloaded"', async ({
  page,
  context,
}) => {
  await fakeGoogle(page)
  await connectAndOpenAuthor(page)
  await page.getByRole('button', { name: 'Add everything in this folder' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Added 3 books.' })).toBeVisible()
  await page.getByRole('button', { name: 'Back to library' }).click()

  await link(page, /The Test Voyage/).click()
  await expect(page.getByText('01 / 04')).toBeVisible()
  await page.getByRole('button', { name: 'Back to library' }).click()
  // The service worker controls the page from the next load on.
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
  })
  await page.reload()
  await page.waitForFunction(() => !!navigator.serviceWorker.controller)

  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Library' })).toBeVisible()
  await expect(
    page.locator('article, li').filter({ hasText: 'Second Voyage' }).filter({ visible: true }),
  ).toContainText('Not downloaded')

  await link(page, /The Test Voyage/).click()
  await expect(page).toHaveURL(/\/read\/voyage$/)
  await expect(page.locator('footer').getByText('01 / 04')).toBeVisible()
  await context.setOffline(false)
})

test('an interrupted download offers to try again, and the retry succeeds', async ({ page }) => {
  const google = await fakeGoogle(page)
  await connectAndOpenAuthor(page)
  await page.getByRole('button', { name: /^Ada Fixture/ }).click()
  await page.getByRole('checkbox', { name: 'Select The Test Voyage' }).check()
  await page.getByRole('button', { name: 'Add 1 book' }).click()
  await page.getByRole('button', { name: 'Back to library' }).click()

  google.abortDownloads = true
  await link(page, /The Test Voyage/).click()
  const alert = page.getByRole('alert')
  await expect(alert).toBeVisible()
  await expect(alert.getByRole('button', { name: 'Try again' })).toBeVisible()

  google.abortDownloads = false
  await alert.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByText('01 / 04')).toBeVisible()
})
