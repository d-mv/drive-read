import { defineConfig } from '@playwright/test'

/** The desktop spike only: launches Electron directly, no web server. */
export default defineConfig({
  testDir: '.',
  testMatch: 'spike.spec.ts',
  reporter: 'list',
  timeout: 60_000,
  use: { trace: 'retain-on-failure' },
})
