import { expect, type Page, test } from '@playwright/test'

const PDF = 'e2e/fixtures/test-manual.pdf'

async function openPdf(page: Page) {
  await page.goto('/')
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Open a file from this device' }).click()
  await (await chooser).setFiles(PDF)
  await expect(page).toHaveURL(/\/read\/local-/)
  await expect(page.getByText('Page 1 of 6', { exact: true })).toBeVisible()
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
  await expect(page.getByText('Page 3 of 6', { exact: true })).toBeVisible()
  await expect(page.getByText('02 / 03')).toBeVisible()
  expect(violations).toEqual([])
})

test('pages forward through the PDF and restores the page after a reload', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'keyboard paging is a desktop path')
  await openPdf(page)
  for (
    let i = 0;
    i < 6 && !(await page.getByText('Page 2 of 6', { exact: true }).isVisible());
    i++
  ) {
    await page.keyboard.press('ArrowRight')
    await page.waitForTimeout(150)
  }
  await expect(page.getByText('Page 2 of 6', { exact: true })).toBeVisible()

  await page.reload()
  await expect(page.getByText('Page 2 of 6', { exact: true })).toBeVisible()
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

test('the page text is selectable', async ({ page }) => {
  await openPdf(page)
  const layer = page.locator('.textLayer')
  await expect(layer.getByText('Manual page 1 of 6')).toHaveCount(1)
  await expect(layer).toContainText('the keeper checks the lamp')
  // Transparent text over the canvas, which the reader can select and copy.
  const span = layer.getByText('Manual page 1 of 6')
  await expect(span).toHaveCSS('user-select', 'text')
  await expect(span).toHaveCSS('color', 'rgba(0, 0, 0, 0)')
})

test('pdf.js gets its standard fonts and image decoders under the CSP', async ({ page }) => {
  const warnings: string[] = []
  page.on('console', (m) => {
    if (
      /standardFontDataUrl|wasmUrl|Content Security Policy|Unable to load font data/i.test(m.text())
    )
      warnings.push(m.text())
  })
  await openPdf(page)
  // Standard fonts (for PDFs that name a font without embedding it) and colour profiles.
  const served = await page.evaluate(async () =>
    Promise.all(
      [
        '/pdfjs/standard_fonts/LiberationSans-Regular.ttf',
        '/pdfjs/standard_fonts/FoxitSerif.pfb',
        '/pdfjs/iccs/CGATS001Compat-v2-micro.icc',
        '/pdfjs/cmaps/UniJIS-UTF16-H.bcmap',
      ].map(async (u) => (await fetch(u)).status),
    ),
  )
  expect(served).toEqual([200, 200, 200, 200])
  // JPEG 2000 and JBIG2 decoders are WebAssembly: served, and allowed to compile.
  const compiled = await page.evaluate(async () => {
    const names = ['openjpeg.wasm', 'jbig2.wasm', 'qcms_bg.wasm']
    const mods = await Promise.all(
      names.map((n) => WebAssembly.compileStreaming(fetch(`/pdfjs/wasm/${n}`))),
    )
    return mods.every((m) => m instanceof WebAssembly.Module)
  })
  expect(compiled).toBe(true)
  expect(warnings).toEqual([])
})

test('zooms in and out, keeping the page', async ({ page, isMobile }) => {
  await openPdf(page)
  const pageImg = page.getByRole('img', { name: 'Page 1 of 6' })
  // evaluate waits for the current page element (a re-render swaps it).
  const width = () => pageImg.evaluate((el) => el.getBoundingClientRect().width)
  await expect.poll(width).toBeGreaterThan(100)
  const fitted = await width()
  const zoom = page.getByRole('group', { name: 'Zoom' })
  await expect(zoom.getByText('100%')).toBeVisible()

  await zoom.getByRole('button', { name: 'Zoom in' }).click()
  await expect(zoom.getByText('125%')).toBeVisible()
  await expect.poll(width).toBeGreaterThan(fitted * 1.2)
  await expect(page.getByText('Page 1 of 6', { exact: true })).toBeVisible()

  if (!isMobile) {
    await page.keyboard.press('+')
    await expect(zoom.getByText('150%')).toBeVisible()
    await page.keyboard.press('0')
    await expect(zoom.getByText('100%')).toBeVisible()
  } else {
    await zoom.getByRole('button', { name: 'Zoom out' }).click()
    await expect(zoom.getByText('100%')).toBeVisible()
  }
  await expect.poll(width).toBeLessThan(fitted * 1.05)
  await expect(zoom.getByRole('button', { name: 'Zoom out' })).toBeDisabled()
})

test('a two-finger pinch zooms the page', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'pinch is a touch gesture')
  await openPdf(page)
  const pageImg = page.getByRole('img', { name: 'Page 1 of 6' })
  const box = await pageImg.evaluate((el) => el.getBoundingClientRect().toJSON() as DOMRect)
  const cx = box.x + box.width / 2
  const cy = box.y + 200
  const cdp = await page.context().newCDPSession(page)
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', spread: number) =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints:
        type === 'touchEnd'
          ? []
          : [
              { x: cx - spread, y: cy, id: 1 },
              { x: cx + spread, y: cy, id: 2 },
            ],
    })
  await touch('touchStart', 40)
  for (const spread of [50, 60, 70, 80]) await touch('touchMove', spread)
  await touch('touchEnd', 80)

  const zoom = page.getByRole('group', { name: 'Zoom' })
  await expect(zoom.getByText('200%')).toBeVisible()
  await expect
    .poll(() => pageImg.evaluate((el) => el.getBoundingClientRect().width))
    .toBeGreaterThan(box.width * 1.9)
})
