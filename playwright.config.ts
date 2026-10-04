import { defineConfig, devices } from '@playwright/test'

/** E2E against the production build under the production CSP (`vite preview`, see vite.config.ts). */
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  use: { baseURL: 'http://localhost:4173', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    // Empty ingest key: test runs must not write to the drive-read log; a placeholder client id
    // for the faked Google sign-in (e2e/fake-google.ts). Shell env beats .env.
    command:
      'VITE_LOGGER_INGEST_KEY= VITE_GOOGLE_CLIENT_ID=e2e-client bunx vite build && bunx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
