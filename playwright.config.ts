import { defineConfig, devices } from '@playwright/test'

const BASE_URL = process.env.CLIENT_URL ?? 'http://localhost:5173'

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { outputFolder: 'tests/.report', open: 'never' }]],
  outputDir: 'tests/.artifacts',
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },
  projects: [
    {
      name: 'desktop-chromium',
      testDir: './tests/e2e',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } }
    },
    {
      name: 'mobile-chromium',
      testDir: './tests/e2e',
      use: { ...devices['Pixel 7'] }
    },
    {
      name: 'visual-desktop',
      testDir: './tests/visual',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } }
    },
    {
      name: 'visual-mobile',
      testDir: './tests/visual',
      use: { ...devices['Pixel 7'] }
    },
    {
      name: 'ux-audit',
      testDir: './tests/ux',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } }
    },
    {
      name: 'ux-mobile',
      testDir: './tests/ux',
      use: { ...devices['Pixel 7'] }
    }
  ]
})
