import { deflateRawSync } from 'node:zlib'

import { expect, type Page, test } from '@playwright/test'

/** A 1×1 PNG. */
const PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

/** An FB2 whose cover image is `href`, with one embedded image `cover.png`. */
const fb2 = (href: string) =>
  Buffer.from(`<?xml version="1.0" encoding="utf-8"?>
<FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0" xmlns:l="http://www.w3.org/1999/xlink">
<description><title-info>
  <author><first-name>Ada</first-name><last-name>Fixture</last-name></author>
  <book-title>Cover Probe</book-title><lang>en</lang>
  <coverpage><image l:href="${href}"/></coverpage>
</title-info></description>
<body><section><title><p>One</p></title><p>Text.</p></section></body>
<binary id="cover.png" content-type="image/png">${PNG}</binary>
</FictionBook>`)

/** A deflate zip of `files`, in order. */
function zip(files: [name: string, data: Buffer][]): Buffer {
  const parts: Buffer[] = []
  const central: Buffer[] = []
  let offset = 0
  for (const [name, data] of files) {
    const n = Buffer.from(name)
    const body = deflateRawSync(data)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(8, 8)
    local.writeUInt32LE(body.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(n.length, 26)
    parts.push(local, n, body)
    const dir = Buffer.alloc(46)
    dir.writeUInt32LE(0x02014b50, 0)
    dir.writeUInt16LE(20, 4)
    dir.writeUInt16LE(20, 6)
    dir.writeUInt16LE(8, 10)
    dir.writeUInt32LE(body.length, 20)
    dir.writeUInt32LE(data.length, 24)
    dir.writeUInt16LE(n.length, 28)
    dir.writeUInt32LE(offset, 42)
    central.push(dir, n)
    offset += 30 + n.length + body.length
  }
  const dirBytes = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(files.length, 8)
  end.writeUInt16LE(files.length, 10)
  end.writeUInt32LE(dirBytes.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...parts, dirBytes, end])
}

async function chooseFile(page: Page, name: string, buffer: Buffer) {
  await page.goto('/')
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Open a file from this device' }).click()
  await (await chooser).setFiles({ name, mimeType: '', buffer })
}

async function openFile(page: Page, name: string, buffer: Buffer) {
  await chooseFile(page, name, buffer)
  await expect(page).toHaveURL(/\/read\/local-[0-9a-f]{32}$/)
}

const coverImage = (page: Page) =>
  page.locator('img[src^="blob:"]').filter({ visible: true }).first()

test('an FB2 shows the cover embedded in it', async ({ page }) => {
  await openFile(page, 'probe.fb2', fb2('#cover.png'))
  await expect(page.locator('header').getByText('Cover Probe')).toBeVisible()
  await page.getByRole('button', { name: 'Back to library' }).click()
  await expect(coverImage(page)).toBeVisible()
})

test('an FB2 cover that points outside the book is never fetched', async ({ page }) => {
  const probes: string[] = []
  page.on('request', (r) => {
    if (r.url().includes('cover-probe')) probes.push(r.url())
  })
  // Same origin, so the CSP alone would let the request through.
  await openFile(page, 'probe.fb2', fb2('/cover-probe.jpg'))
  await expect(page.locator('header').getByText('Cover Probe')).toBeVisible()
  await page.getByRole('button', { name: 'Back to library' }).click()
  await expect(page.getByRole('link', { name: /Cover Probe/ }).first()).toBeVisible()
  await expect(coverImage(page)).toHaveCount(0)
  expect(probes).toEqual([])
})

test('a zip bomb named .epub is refused, not unpacked', async ({ page }) => {
  // 300 MB of spaces in the file every EPUB reads first; about 300 KB zipped.
  const bomb = zip([
    ['mimetype', Buffer.from('application/epub+zip')],
    ['META-INF/container.xml', Buffer.alloc(300 * 1024 * 1024, 0x20)],
  ])
  expect(bomb.length).toBeLessThan(1024 * 1024)
  await chooseFile(page, 'bomb.epub', bomb)
  await expect(page.getByRole('alert')).toContainText("bomb.epub: This file can't be opened.")
  await expect(page).not.toHaveURL(/\/read\//)
})
