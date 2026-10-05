/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

import { CSP } from './csp'

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

const PAPER = '#F3F0E8'

export default defineConfig({
  // DR_APP_VERSION overrides the version for the e2e update test (two builds, two versions).
  define: { __APP_VERSION__: JSON.stringify(process.env.DR_APP_VERSION ?? version) },
  plugins: [
    tailwindcss(),
    vue(),
    VitePWA({
      // A new worker waits; the library shows "Update available". Never reloads mid-book.
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['icon.svg', 'theme-init.js', 'apple-touch-icon-180x180.png'],
      manifest: {
        id: '/',
        name: 'Drive Read',
        short_name: 'Drive Read',
        description: 'Read the books in your Google Drive, online or off.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: PAPER,
        theme_color: PAPER,
        categories: ['books', 'education'],
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
        // Not in the PWA plugin's manifest type yet.
        ...({
          file_handlers: [
            {
              action: '/',
              accept: { 'application/epub+zip': ['.epub'], 'application/pdf': ['.pdf'] },
            },
          ],
        } as object),
      },
      workbox: {
        // Both engines (foliate-js, pdf.js and its worker) are precached: books open offline.
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,woff2}'],
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
    // Vitest loads .env: unit tests must never write to the production log.
    env: { VITE_LOGGER_INGEST_KEY: '' },
  },
})
