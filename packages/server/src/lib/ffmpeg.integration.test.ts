/**
 * Integration test for the FFmpeg command builders.
 *
 * Spawns a real ffmpeg binary against a synthetic MPEG-TS fixture and
 * verifies each pipeline stage (record copy → convert → thumbnail)
 * produces a non-empty, correctly-typed output. This catches issues the
 * unit tests miss — wrong flag order, codec names that aren't in the
 * build, bad container/codec pairings, etc.
 *
 * The fixture is generated via ffmpeg's lavfi input (`testsrc` + `sine`)
 * so the test is self-contained — no network download, no committed
 * binary blobs. Devcontainer ffmpeg ships without NVENC/VAAPI devices,
 * so only the software paths (`hwAccel: 'none'`) are exercised here.
 * HW paths keep unit-test coverage only until there's HW in CI.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildConvertArgs, buildRecordArgs, buildThumbnailArgs } from './ffmpeg'

const FIXTURE_DIR = join(tmpdir(), 'kototv-ffmpeg-itest')
const FIXTURE_INPUT = join(FIXTURE_DIR, 'fixture.ts')
const FIXTURE_DURATION_S = 3

async function runFfmpeg(args: string[]): Promise<{ code: number; stderr: string }> {
  const proc = Bun.spawn(['ffmpeg', ...args], { stdout: 'pipe', stderr: 'pipe' })
  const [, stderr, code] = await Promise.all([proc.stdout, new Response(proc.stderr).text(), proc.exited])
  return { code, stderr }
}

function assertFileNonEmpty(path: string, minBytes = 1024): void {
  expect(existsSync(path), `file should exist at ${path}`).toBe(true)
  const size = statSync(path).size
  expect(size, `file at ${path} should be > ${minBytes} bytes`).toBeGreaterThan(minBytes)
}

// ─── Setup: generate a synthetic TS fixture once ──────────────────────────────

beforeAll(async () => {
  rmSync(FIXTURE_DIR, { recursive: true, force: true })
  mkdirSync(FIXTURE_DIR, { recursive: true })

  // testsrc (color bars + timecode) + sine (440Hz) → MPEG-TS H.264/AAC.
  // Matches the shape of what Mirakc would deliver (TS container, H.264 video,
  // AAC-LATM audio; close enough for the conversion pipe to exercise).
  const { code, stderr } = await runFfmpeg([
    '-y',
    '-f',
    'lavfi',
    '-i',
    `testsrc=duration=${FIXTURE_DURATION_S}:size=320x240:rate=10`,
    '-f',
    'lavfi',
    '-i',
    `sine=frequency=440:duration=${FIXTURE_DURATION_S}`,
    '-c:v',
    'libx264',
    '-preset',
    'ultrafast',
    // One keyframe per second so -ss fast-seek in the thumbnail test lands inside the fixture.
    '-g',
    '10',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-shortest',
    '-f',
    'mpegts',
    FIXTURE_INPUT
  ])
  if (code !== 0) throw new Error(`fixture generation failed (code ${code}):\n${stderr}`)
  assertFileNonEmpty(FIXTURE_INPUT, 10 * 1024)
})

afterAll(() => {
  rmSync(FIXTURE_DIR, { recursive: true, force: true })
})

// ─── buildRecordArgs — TS copy ────────────────────────────────────────────────

describe('buildRecordArgs (pipe-in TS copy)', () => {
  test('writes a valid .ts when TS bytes are piped in', async () => {
    const out = join(FIXTURE_DIR, 'record.ts')
    const args = buildRecordArgs({ outputPath: out })
    const proc = Bun.spawn(['ffmpeg', ...args], { stdin: 'pipe', stdout: 'pipe', stderr: 'pipe' })

    const tsBytes = await Bun.file(FIXTURE_INPUT).bytes()
    proc.stdin.write(tsBytes)
    await proc.stdin.end()

    const stderr = await new Response(proc.stderr).text()
    const code = await proc.exited
    expect(code, `ffmpeg record exit code\n${stderr}`).toBe(0)
    assertFileNonEmpty(out, 10 * 1024)
  })
})

// ─── buildConvertArgs — each codec on the software path ──────────────────────

describe('buildConvertArgs — software codecs', () => {
  test.each([
    { codec: 'avc' as const, ext: 'mp4', expectedCodec: 'h264' },
    { codec: 'hevc' as const, ext: 'mp4', expectedCodec: 'hevc' },
    { codec: 'vp9' as const, ext: 'webm', expectedCodec: 'vp9' }
  ])('$codec transcode produces a playable $ext', async ({ codec, ext, expectedCodec }) => {
    const out = join(FIXTURE_DIR, `out-${codec}.${ext}`)
    const args = buildConvertArgs({
      inputPath: FIXTURE_INPUT,
      outputPath: out,
      hwAccel: 'none',
      codec,
      // Keep the test fast: aggressive preset + low bitrate.
      videoBitrate: 500,
      audioBitrate: 64
    })

    const { code, stderr } = await runFfmpeg(args)
    expect(code, `ffmpeg ${codec} exit\n${stderr}`).toBe(0)
    assertFileNonEmpty(out, 10 * 1024)

    // ffprobe the container: codec_name should match the expected codec so
    // we're confident the output really is hevc/vp9 and not a silent fallback.
    const probe = await runFfmpeg(['-i', out, '-hide_banner'])
    // ffprobe without -f null writes only header info to stderr on success;
    // ffmpeg -i with no output flag exits non-zero but still prints Stream info
    // to stderr — we grep that.
    expect(probe.stderr, `probe output should mention ${expectedCodec}\n${probe.stderr}`).toContain(expectedCodec)
  }, 20_000)
})

// ─── buildThumbnailArgs — single-frame JPEG extraction ───────────────────────

describe('buildThumbnailArgs', () => {
  test('writes a JPEG thumbnail at the configured offset', async () => {
    const out = join(FIXTURE_DIR, 'thumb.jpg')
    // The fixture is 3s long — pick atSeconds=1 so fast-seek lands inside it.
    const args = buildThumbnailArgs({ inputPath: FIXTURE_INPUT, outputPath: out, atSeconds: 1, width: 160 })

    const { code, stderr } = await runFfmpeg(args)
    expect(code, `ffmpeg thumbnail exit\n${stderr}`).toBe(0)
    expect(existsSync(out)).toBe(true)
    // JPEG files start with FFD8FFE0 / FFD8FFE1 (SOI marker).
    const buf = await Bun.file(out).bytes()
    expect(buf[0]).toBe(0xff)
    expect(buf[1]).toBe(0xd8)
  }, 10_000)
})
