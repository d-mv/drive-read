/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

/**
 * The production Content-Security-Policy (architecture doc, Deployment), plus the Logger origin.
 * script-src allows neither blob: nor 'unsafe-inline', so scripts inside a book cannot run.
 * Served by `vite preview` so the built app is tested under it; Caddy serves the same header.
 */
export const CSP = [
  "default-src 'self'",
  "script-src 'self' https://accounts.google.com",
  "connect-src 'self' https://www.googleapis.com https://accounts.google.com https://logger-api.mlnkv.net",
  'frame-src blob: https://accounts.google.com',
  "img-src 'self' blob: data:",
  "style-src 'self' 'unsafe-inline' blob:",
  "font-src 'self' blob: data:",
  "worker-src 'self' blob:",
].join('; ')

const PAPER = '#F3F0E8'

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(version) },
  plugins: [
    tailwindcss(),
    vue(),
    VitePWA({
      // A new worker waits; the library shows "Update available". Never reloads mid-book.
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['icon.svg', 'theme-init.js'],
      manifest: {
        name: 'Drive Read',
        short_name: 'Drive Read',
        description: 'Read the books in your Google Drive, online or off.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: PAPER,
        theme_color: PAPER,
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
        // Not in the PWA plugin's manifest type yet.
        ...({
          file_handlers: [{ action: '/', accept: { 'application/epub+zip': ['.epub'] } }],
        } as object),
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        // pdf.js arrives with the PDF engine (build step 6); keep its chunks out of the precache.
        globIgnores: ['**/pdf*.js', '**/pdf.worker*'],
        navigateFallback: '/index.html',
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@foliate': fileURLToPath(new URL('./vendor/foliate-js', import.meta.url)),
    },
  },
  worker: { format: 'es' },
  preview: { headers: { 'Content-Security-Policy': CSP } },
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.test.ts'],
    setupFiles: ['fake-indexeddb/auto'],
  },
})
