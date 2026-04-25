import { execFileSync } from 'node:child_process'
import { mkdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { Locator, Page } from '@playwright/test'

const CONVERT_SCRIPT = join(__dirname, '_convert-webp.mjs')

export async function captureWebp(
  target: Page | Locator,
  outPath: string,
  opts: { fullPage?: boolean; quality?: number } = {}
): Promise<void> {
  const { quality = 95, fullPage = false } = opts
  mkdirSync(dirname(outPath), { recursive: true })

  const buf =
    'goto' in target
      ? await (target as Page).screenshot({ type: 'png', fullPage })
      : await (target as Locator).screenshot({ type: 'png' })

  const tmpPng = outPath.replace(/\.webp$/, '.tmp.png')
  writeFileSync(tmpPng, buf)

  try {
    execFileSync('node', [CONVERT_SCRIPT, tmpPng, outPath, String(quality)], {
      timeout: 15_000
    })
    try {
      unlinkSync(tmpPng)
    } catch {}
  } catch {
    renameSync(tmpPng, outPath.replace(/\.webp$/, '.png'))
  }
}
