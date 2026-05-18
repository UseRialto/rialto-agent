import { defineConfig } from '@playwright/test'

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000'

export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  fullyParallel: true,
  workers: 1,
  timeout: 30_000,
  use: {
    baseURL,
    browserName: 'chromium',
    channel: 'chrome',
    headless: true,
  },
})
