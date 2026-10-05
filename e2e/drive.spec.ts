import { expect, type Page, test } from '@playwright/test'

import { fakeGoogle } from './fake-google'

async function connect(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Connect Google Drive' }).click()
  await expect(page).toHaveURL(/\/drive$/)
  await expect(page.getByRole('heading', { name: 'Add from Drive' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Stocks', exact: true })).toBeVisible()
}

/** My Drive / Stocks / books / <author folder>. */
async function openAuthor(page: Page, author: RegExp) {
  await page.getByRole('button', { name: 'Stocks', exact: true }).click()
  await page.getByRole('button', { name: 'books', exact: true }).click()
  await page.getByRole('button', { name: author }).click()
}

async function addVoyage(page: Page) {
  await openAuthor(page, /^Ada Fixture/)
  await page.getByRole('checkbox', { name: 'Select The Test Voyage' }).check()
  await page.getByRole('button', { name: 'Add 1 book' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Added 1 book.' })).toBeVisible()
}

const row = (page: Page, title: string) => page.getByRole('listitem').filter({ hasText: title })
const voyageLink = (page: Page) =>
  page
    .getByRole('link', { name: /The Test Voyage/ })
    .filter({ visible: true })
    .first()

test('opens on My Drive folders, with no all-books list', async ({ page }) => {
  await fakeGoogle(page)
  await connect(page)
  await expect(page.getByRole('button', { name: 'All books' })).toHaveCount(0)
  await expect(page.getByRole('checkbox')).toHaveCount(0)
  await expect(page.getByRole('navigation', { name: 'Folder path' })).toContainText('My Drive')
})

test('adds a book from a folder and downloads it on first open', async ({ page }) => {
  const google = await fakeGoogle(page)
  await connect(page)
  await addVoyage(page)
  await expect(row(page, 'The Test Voyage')).toContainText('In library')

  await page.getByRole('button', { name: 'Back to library' }).click()
  await expect(page.getByText('Drive only').filter({ visible: true }).first()).toBeVisible()
  expect(google.downloads).toEqual([])

  await voyageLink(page).click()
  await expect(page.getByText('01 / 04')).toBeVisible()
  expect(google.downloads).toEqual(['voyage'])

  // Real metadata replaces the file-name guess; reopening uses the stored copy.
  await page.getByRole('button', { name: 'Back to library' }).click()
  await expect(page.getByText('Drive only')).toHaveCount(0)
  await voyageLink(page).click()
  await expect(page.getByText('01 / 04')).toBeVisible()
  expect(google.downloads).toEqual(['voyage'])
})

test('searches Drive by name and goes back to the same folder', async ({ page }) => {
  await fakeGoogle(page)
  await connect(page)
  await page.getByRole('button', { name: 'Stocks', exact: true }).click()
  await page.getByRole('searchbox', { name: 'Search books in your Drive' }).fill('second')
  await expect(row(page, 'Second Voyage')).toBeVisible()
  await expect(row(page, 'Ship Notes')).toHaveCount(0)

  await page.getByRole('button', { name: 'Back to folders' }).click()
  await expect(page.getByRole('button', { name: 'books', exact: true })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Folder path' })).toContainText('Stocks')
})

test('browses folders and adds everything under one, at any depth', async ({ page }) => {
  await fakeGoogle(page)
  await connect(page)
  await page.getByRole('button', { name: 'Stocks', exact: true }).click()
  await page.getByRole('button', { name: 'books', exact: true }).click()
  await expect(page.getByRole('button', { name: /^Ada Fixture/ })).toBeVisible()
  await expect(page.getByText('fixture,-ada')).toBeVisible()

  await page.getByRole('button', { name: 'Add everything in this folder' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Added 3 books.' })).toBeVisible()

  await page
    .getByRole('navigation', { name: 'Folder path' })
    .getByRole('button', { name: 'My Drive' })
    .click()
  await expect(page.getByRole('button', { name: 'Stocks', exact: true })).toBeVisible()
})

test('an expired token asks to reconnect, then the download continues', async ({ page }) => {
  const google = await fakeGoogle(page)
  await connect(page)
  await addVoyage(page)
  await page.getByRole('button', { name: 'Back to library' }).click()

  google.downloadStatus = 401
  await voyageLink(page).click()
  await expect(page.getByRole('alert')).toContainText('Reconnect Drive to download it')

  google.downloadStatus = 200
  await page.getByRole('button', { name: 'Reconnect Drive' }).click()
  await expect(page.getByText('01 / 04')).toBeVisible()
})

test('a book deleted from Drive says so and can be removed', async ({ page }) => {
  const google = await fakeGoogle(page)
  await connect(page)
  await addVoyage(page)
  await page.getByRole('button', { name: 'Back to library' }).click()

  google.downloadStatus = 404
  await voyageLink(page).click()
  await expect(page.getByRole('alert')).toContainText('Missing in Drive')
  await page.getByRole('button', { name: 'Remove book' }).click()
  await expect(
    page.getByRole('heading', { name: 'Read the books in your Google Drive' }),
  ).toBeVisible()
})

test('a slow search answered after leaving it does not spill into the folder view', async ({
  page,
}) => {
  const google = await fakeGoogle(page)
  await connect(page)
  google.searchDelayMs = 1500
  await page.getByRole('searchbox', { name: 'Search books in your Drive' }).fill('voyage')
  await page.waitForTimeout(400) // the search request is in flight
  await page.getByRole('button', { name: 'Back to folders' }).click()
  await expect(page.getByRole('button', { name: 'Stocks', exact: true })).toBeVisible()

  await page.waitForTimeout(2000) // the slow search has answered by now
  await expect(page.getByRole('button', { name: 'Stocks', exact: true })).toBeVisible()
  await expect(page.getByRole('checkbox')).toHaveCount(0)
})

test('removing a download frees the file but keeps the book and the place', async ({ page }) => {
  const google = await fakeGoogle(page)
  await connect(page)
  await addVoyage(page)
  await page.getByRole('button', { name: 'Back to library' }).click()
  await voyageLink(page).click()
  await expect(page.getByText('01 / 04')).toBeVisible()
  await page.getByRole('button', { name: 'Back to library' }).click()

  // The reader's "Not enough space" error links here.
  await page.goto('/?show=downloaded')
  const downloads = page.getByRole('list', { name: 'Downloaded books' })
  await expect(downloads.getByRole('listitem')).toHaveCount(1)
  await expect(downloads).toContainText(/\d+(\.\d)? (KB|MB)/)
  await downloads.getByRole('button', { name: 'Remove download of The Test Voyage' }).click()
  await expect(downloads).toHaveCount(0)
  await expect(page.getByText('No downloaded Drive books on this device.')).toBeVisible()

  // Still in the library; opening downloads it again.
  await page.getByRole('button', { name: /^All/ }).click()
  await voyageLink(page).click()
  await expect(page).toHaveURL(/\/read\/voyage$/)
  await expect(page.getByRole('progressbar', { name: 'Reading progress' })).toBeVisible()
  expect(google.downloads).toEqual(['voyage', 'voyage'])
})

test.describe('Drive file changes', () => {
  /** A whole-Drive listing: the daily check of the library's files (sync/driveCheck.ts). */
  const isDriveCheck = (url: string) =>
    new URL(url).searchParams.get('q')?.startsWith('trashed = false') ?? false

  /** Adds and opens the Voyage, and waits for the first daily check (made on that open). */
  async function readVoyage(page: Page) {
    await page.clock.install()
    const google = await fakeGoogle(page)
    await connect(page)
    await addVoyage(page)
    await page.getByRole('button', { name: 'Back to library' }).click()
    const firstCheck = page.waitForResponse((r) => isDriveCheck(r.url()))
    await voyageLink(page).click()
    await expect(page.getByRole('progressbar', { name: 'Reading progress' })).toBeVisible()
    await firstCheck
    await page.getByRole('button', { name: 'Back to library' }).click()
    return google
  }

  /** The next day: the token has expired, so the reader reconnects, which syncs and checks. */
  async function nextDayReconnect(page: Page) {
    await page.clock.fastForward('25:00:00')
    await page.getByRole('link', { name: 'Add from Drive' }).click()
    const check = page.waitForResponse((r) => isDriveCheck(r.url()))
    await page.getByRole('button', { name: 'Reconnect Drive' }).click()
    await check
    await page.getByRole('button', { name: 'Back to library' }).click()
  }

  test('a book deleted from Drive is marked, and its copy still opens', async ({ page }) => {
    const google = await readVoyage(page)
    google.deleted.push('voyage')
    await nextDayReconnect(page)
    await expect(page.getByText('Missing in Drive').filter({ visible: true })).toHaveCount(1)
    await voyageLink(page).click()
    await expect(page.getByRole('progressbar', { name: 'Reading progress' })).toBeVisible()
    expect(google.downloads).toEqual(['voyage'])
  })

  test('a book replaced in Drive offers its new version, downloaded on request', async ({
    page,
  }) => {
    const google = await readVoyage(page)
    google.md5.voyage = 'md5-voyage-v2'
    await nextDayReconnect(page)
    await expect(page.getByText('New version').filter({ visible: true })).toHaveCount(1)

    await voyageLink(page).click()
    const notice = page.getByRole('status').filter({ hasText: 'A newer version of this book' })
    await expect(notice).toBeVisible()
    await notice.getByRole('button', { name: 'Get it' }).click()
    await expect.poll(() => google.downloads).toEqual(['voyage', 'voyage'])
    await expect(notice).toHaveCount(0)
    await expect(page.getByRole('progressbar', { name: 'Reading progress' })).toBeVisible()

    await page.getByRole('button', { name: 'Back to library' }).click()
    await expect(page.getByText('New version')).toHaveCount(0)
  })
})
