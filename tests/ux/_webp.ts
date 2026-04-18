import type { Locator, Page } from '@playwright/test'
import sharp from 'sharp'

/**
 * Capture a Page or Locator as an in-memory PNG buffer and save it as WEBP
 * via `sharp`. Playwright's native `screenshot({ type })` only supports
 * PNG / JPEG; WEBP requires post-processing. Quality 95 is visually
 * lossless for UI captures.
 */
export async function captureWebp(
  target: Page | Locator,
  outPath: string,
  opts: { fullPage?: boolean; quality?: number } = {}
): Promise<void> {
  const { quality = 95, fullPage = false } = opts
  const buf =
    'goto' in target
      ? await (target as Page).screenshot({ type: 'png', fullPage })
      : await (target as Locator).screenshot({ type: 'png' })
  await sharp(buf).webp({ quality }).toFile(outPath)
}
