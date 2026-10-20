import { expect, type Page, test } from '@playwright/test'

/**
 * Headless Chromium has no voices, so speechSynthesis is replaced by a fake that "speaks" one word
 * per `__wordMs` (sending word boundaries) and records what it was given. Everything else — the
 * book's text, the SSML, highlighting and page turns — is the real foliate-js path.
 */
declare global {
  interface Window {
    __said: { text: string; lang: string; rate: number }[]
    __wordMs: number
    __boundaries: boolean
  }
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.__said = []
    window.__wordMs = 40
    window.__boundaries = true
    class Utterance {
      lang = ''
      rate = 1
      voice = null
      onboundary: ((e: { charIndex: number; name: string }) => void) | null = null
      onend: (() => void) | null = null
      onerror: ((e: { error: string }) => void) | null = null
      constructor(public text: string) {}
    }
    let timers: number[] = []
    const synth = {
      getVoices: () => [],
      cancel() {
        timers.forEach(clearTimeout)
        timers = []
      },
      speak(u: Utterance) {
        window.__said.push({ text: u.text, lang: u.lang, rate: u.rate })
        let at = 0
        if (window.__boundaries)
          for (const m of u.text.matchAll(/\S+/g)) {
            at += window.__wordMs
            timers.push(
              window.setTimeout(() => u.onboundary?.({ charIndex: m.index, name: 'word' }), at),
            )
          }
        timers.push(window.setTimeout(() => u.onend?.(), at + 1))
      },
    }
    Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true })
    Object.defineProperty(window, 'SpeechSynthesisUtterance', {
      value: Utterance,
      configurable: true,
    })
  })
})

async function openBook(page: Page, path: string, counter: string) {
  await page.goto('/')
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Open a file from this device' }).click()
  await (await chooser).setFiles(path)
  await expect(page).toHaveURL(/\/read\/local-[0-9a-f]{32}$/)
  await expect(page.getByText(counter, { exact: true })).toBeVisible()
}

const said = (page: Page) => page.evaluate(() => window.__said)
/** The highlighted word: tts.js selects it in the section's frame. */
const highlighted = (page: Page) =>
  Promise.all(
    page
      .frames()
      .map((f) => f.evaluate(() => document.getSelection()?.toString() ?? '').catch(() => '')),
  ).then((all) => all.join('').trim())

test('reads an EPUB aloud from the page on screen, word by word', async ({ page }) => {
  await openBook(page, 'e2e/fixtures/test-voyage.epub', '01 / 04')
  await page.getByRole('button', { name: 'Read aloud', exact: true }).click()

  await expect.poll(async () => (await said(page))[0]?.text.trim()).toBe('Departure')
  await expect.poll(async () => (await said(page)).length).toBeGreaterThan(1)
  expect((await said(page))[1]!.text).toContain('Chapter 1, line 1:')
  await expect.poll(() => highlighted(page)).toMatch(/^\S+$/)

  const controls = page.getByRole('group', { name: 'Read aloud' })
  await controls.getByRole('button', { name: 'Pause' }).click()
  const count = (await said(page)).length
  await page.waitForTimeout(300)
  expect((await said(page)).length).toBe(count)

  await controls.getByRole('button', { name: 'Faster' }).click()
  await expect(controls.getByText('1.25×')).toBeVisible()
  await controls.getByRole('button', { name: 'Resume' }).click()
  await expect.poll(async () => (await said(page)).at(-1)?.rate).toBe(1.25)

  await controls.getByRole('button', { name: 'Stop reading aloud' }).click()
  await expect(controls).toBeHidden()
  await expect.poll(() => highlighted(page)).toBe('')
})

test('turns pages and carries on into the next chapter', async ({ page }) => {
  await openBook(page, 'e2e/fixtures/test-voyage.epub', '01 / 04')
  // Voices without word boundaries still move the reader along, block by block.
  await page.evaluate(() => (window.__boundaries = false))
  await page.getByRole('button', { name: 'Read aloud', exact: true }).click()
  await expect(page.getByText('02 / 04')).toBeVisible({ timeout: 15_000 })
  await expect
    .poll(async () => (await said(page)).some((s) => s.text.trim() === 'The Long Calm'))
    .toBe(true)
})

test('reads an FB2 in its own language', async ({ page }) => {
  await openBook(page, 'e2e/fixtures/test-flame.fb2', '01 / 03')
  await page.keyboard.press('r')
  await expect.poll(async () => (await said(page)).length).toBeGreaterThan(0)
  const first = (await said(page))[0]!
  expect(first.text).toMatch(/[а-яё]/i)
  expect(first.lang).toMatch(/^ru/)
})

test('PDFs do not offer reading aloud', async ({ page }) => {
  await openBook(page, 'e2e/fixtures/test-manual.pdf', 'Page 1 of 6')
  await expect(page.getByRole('button', { name: 'Read aloud', exact: true })).toHaveCount(0)
})
