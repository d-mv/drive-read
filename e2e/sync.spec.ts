import { expect, type Page, test } from '@playwright/test'

import { appDataStore, fakeGoogle } from './fake-google'

/** Two browser contexts = two devices with separate storage, one Drive. Desktop only. */
test.skip(({ isMobile }) => isMobile, 'keyboard paging is a desktop path')

async function connect(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Connect Google Drive' }).click()
  await expect(page).toHaveURL(/\/drive$/)
}

async function addVoyage(page: Page) {
  await page.getByRole('button', { name: 'Stocks', exact: true }).click()
  await page.getByRole('button', { name: 'books', exact: true }).click()
  await page.getByRole('button', { name: /^Ada Fixture/ }).click()
  await page.getByRole('checkbox', { name: 'Select The Test Voyage' }).check()
  await page.getByRole('button', { name: 'Add 1 book' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Added 1 book.' })).toBeVisible()
}

const percent = async (page: Page) =>
  Number(
    await page.getByRole('progressbar', { name: 'Reading progress' }).getAttribute('aria-valuenow'),
  )

async function readOn(page: Page, pages: number) {
  await expect(page.getByText(/^\d\d \/ 04$/)).toBeVisible()
  const start = await percent(page)
  for (let i = 0; i < pages; i++) await page.keyboard.press('ArrowRight')
  await expect.poll(() => percent(page)).toBeGreaterThan(start)
  return percent(page)
}

async function syncNow(page: Page) {
  await page.getByRole('button', { name: 'Back to library' }).click()
  await page.getByRole('button', { name: /^(Synced|Not synced yet)/ }).click()
  await expect(page.getByRole('button', { name: /^Synced/ })).toBeVisible()
}

/** Whether this device still has library changes to push (IndexedDB `meta`). */
const libraryDirty = (page: Page) =>
  page.evaluate(async () => {
    const name = (await indexedDB.databases())[0]?.name
    if (!name) return true
    const db = await new Promise<IDBDatabase>((res, rej) => {
      const r = indexedDB.open(name)
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    })
    const metas = await new Promise<{ library: { dirty: boolean } }[]>((res) => {
      const r = db.transaction('meta').objectStore('meta').getAll()
      r.onsuccess = () => res(r.result)
    })
    db.close()
    return metas.some((m) => m.library?.dirty)
  })

const openVoyage = (page: Page) =>
  page
    .getByRole('link', { name: /The Test Voyage/ })
    .filter({ visible: true })
    .first()
    .click()

test('a book and its position follow you to another device', async ({ browser }) => {
  const drive = appDataStore()
  const laptop = await (await browser.newContext()).newPage()
  await fakeGoogle(laptop, drive)
  await connect(laptop)
  await addVoyage(laptop)
  await laptop.getByRole('button', { name: 'Back to library' }).click()
  await openVoyage(laptop)
  const read = await readOn(laptop, 8)
  await syncNow(laptop)

  const phone = await (await browser.newContext()).newPage()
  await fakeGoogle(phone, drive)
  await connect(phone)
  await phone.getByRole('button', { name: 'Back to library' }).click()
  await expect(phone.getByRole('region', { name: 'Continue reading' })).toContainText(
    'The Test Voyage',
  )
  await openVoyage(phone)
  await expect.poll(() => percent(phone)).toBe(read)
})

test('a newer position from another device is offered in the open book', async ({ browser }) => {
  const drive = appDataStore()
  const laptop = await (await browser.newContext()).newPage()
  await fakeGoogle(laptop, drive)
  await connect(laptop)
  await addVoyage(laptop)
  await syncNow(laptop)

  const phone = await (await browser.newContext()).newPage()
  await fakeGoogle(phone, drive)
  await connect(phone)
  await phone.getByRole('button', { name: 'Back to library' }).click()
  await openVoyage(phone)
  const further = await readOn(phone, 10)
  await syncNow(phone)

  await openVoyage(laptop)
  const offer = laptop.getByRole('status').filter({ hasText: /^Jump to \d+%, read on Computer/ })
  await expect(offer).toBeVisible()
  await offer.getByRole('button', { name: 'Jump' }).click()
  await expect.poll(() => percent(laptop)).toBe(further)
  await expect(offer).toHaveCount(0)
})

test('a new session with lapsed Drive access asks to reconnect, though nothing is waiting', async ({
  page,
}) => {
  await fakeGoogle(page)
  await connect(page)
  await addVoyage(page)
  await page.getByRole('button', { name: 'Back to library' }).click()
  await page.getByRole('button', { name: /^(Synced|Not synced yet)/ }).click()
  // "Synced" may still be the label from connecting: wait until the added book is pushed.
  await expect.poll(() => libraryDirty(page)).toBe(false)

  // The token lives in sessionStorage: a new browser session starts without it.
  await page.evaluate(() => sessionStorage.removeItem('drive-read:token'))
  await page.reload()
  await expect(page.getByText('Reconnect to get progress from your other devices')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Reconnect to sync' })).toBeVisible()

  await page.getByRole('button', { name: 'Reconnect', exact: true }).click()
  await expect(page.getByRole('button', { name: /^Synced/ })).toBeVisible()
  await expect(page.getByText('Reconnect to get progress from your other devices')).toBeHidden()
})
