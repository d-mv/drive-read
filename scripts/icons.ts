/**
 * Renders the PWA PNG icons from public/icon.svg (iOS ignores SVG icons; Android wants a
 * maskable one). Uses the Playwright Chromium already installed for e2e: no image library.
 * Run: bun scripts/icons.ts
 */
import { readFileSync } from 'node:fs'

import { chromium } from '@playwright/test'

const svg = readFileSync('public/icon.svg', 'utf8')
const INK = '#1C1B19'

// Maskable: full-bleed ground, artwork shrunk into the 80% safe zone.
const maskable = svg.replace(
  /<svg([^>]*)>([\s\S]*)<\/svg>/,
  `<svg$1><rect width="512" height="512" fill="${INK}"/><g transform="translate(76.8 76.8) scale(0.7)">$2</g></svg>`,
)

const targets = [
  { file: 'public/pwa-192x192.png', size: 192, source: svg },
  { file: 'public/pwa-512x512.png', size: 512, source: svg },
  { file: 'public/maskable-512x512.png', size: 512, source: maskable },
  { file: 'public/apple-touch-icon-180x180.png', size: 180, source: maskable },
]

const browser = await chromium.launch()
const page = await browser.newPage()
for (const t of targets) {
  await page.setViewportSize({ width: t.size, height: t.size })
  const sized = t.source.replace('<svg', `<svg width="${t.size}" height="${t.size}"`)
  await page.setContent(`<style>html,body{margin:0;background:${INK}}</style>${sized}`)
  await page.screenshot({ path: t.file, omitBackground: false })
  console.log(`wrote ${t.file}`)
}
await browser.close()
