import { defineConfig } from '@playwright/test'

/** Desktop app E2E: launches Electron on the built app (`bun run test:desktop` builds first). */
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  timeout: 60_000,
  use: { trace: 'retain-on-failure' },
})
