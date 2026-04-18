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
    video: 'retain-on-failure',
    /* deviceScaleFactor 2 so ad-hoc screenshots land at 2880x1800-ish on
     * 1440x900 viewport — icon/text overlaps are legible rather than a
     * blurry pile of pixels. Visual regression baselines stay at 1x (below)
     * to keep repo size sane. */
    deviceScaleFactor: 2
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
      /* Visual-regression baselines — pin 1x DPR so committed snapshots are
       * viewport-pixel sized (small repo footprint, deterministic diffs). */
      name: 'visual-desktop',
      testDir: './tests/visual',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 }
    },
    {
      name: 'visual-mobile',
      testDir: './tests/visual',
      use: { ...devices['Pixel 7'], deviceScaleFactor: 1 }
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
