import { describe, expect, test } from 'bun:test'
import type { FfmpegArgsOptions } from './ffmpeg'
import { buildConvertArgs, buildDummyLiveArgs, buildFfmpegArgs, buildRecordArgs, buildThumbnailArgs } from './ffmpeg'

const BASE_OPTS = {
  outputDir: '/app/data/hls/test-session',
  segmentSeconds: 2,
  listSize: 6,
  videoBitrate: 4000,
  audioBitrate: 128
} satisfies Omit<FfmpegArgsOptions, 'hwAccel'>

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Return the value immediately following `flag` in the args array, or undefined. */
function flagValue(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag)
  return idx !== -1 ? args[idx + 1] : undefined
}

/** True when `value` appears anywhere in the array. */
function contains(args: string[], value: string): boolean {
  return args.includes(value)
}

// ---------------------------------------------------------------------------
// HW accel — encoder codec selection
// ---------------------------------------------------------------------------

describe('hwAccel: none (libx264)', () => {
  const args = buildFfmpegArgs({ ...BASE_OPTS, hwAccel: 'none' })

  test('uses libx264 codec', () => {
    expect(flagValue(args, '-c:v')).toBe('libx264')
  })

  test('includes -preset veryfast', () => {
    expect(flagValue(args, '-preset')).toBe('veryfast')
  })

  test('includes -tune zerolatency', () => {
    expect(flagValue(args, '-tune')).toBe('zerolatency')
  })

  test('does not use hwaccel flags', () => {
    expect(contains(args, '-hwaccel')).toBe(false)
    expect(contains(args, '-vaapi_device')).toBe(false)
  })
})

describe('hwAccel: nvenc', () => {
  const args = buildFfmpegArgs({ ...BASE_OPTS, hwAccel: 'nvenc' })

  test('uses h264_nvenc codec', () => {
    expect(flagValue(args, '-c:v')).toBe('h264_nvenc')
  })

  test('includes -hwaccel cuda', () => {
    expect(flagValue(args, '-hwaccel')).toBe('cuda')
  })

  test('includes -preset p4', () => {
    expect(flagValue(args, '-preset')).toBe('p4')
  })
})

describe('hwAccel: vaapi', () => {
  const args = buildFfmpegArgs({ ...BASE_OPTS, hwAccel: 'vaapi' })

  test('uses h264_vaapi codec', () => {
    expect(flagValue(args, '-c:v')).toBe('h264_vaapi')
  })

  test('includes -vaapi_device /dev/dri/renderD128', () => {
    expect(flagValue(args, '-vaapi_device')).toBe('/dev/dri/renderD128')
  })

  test('includes -vf format=nv12,hwupload', () => {
    expect(flagValue(args, '-vf')).toBe('format=nv12,hwupload')
  })

  test('does not include -hwaccel cuda keyword', () => {
    // vaapi uses -vaapi_device instead of -hwaccel
    expect(contains(args, 'cuda')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// HLS flags invariant (tmpfs overflow prevention)
// ---------------------------------------------------------------------------

describe('HLS flags invariant', () => {
  for (const hwAccel of ['none', 'nvenc', 'vaapi'] as const) {
    test(`delete_segments+append_list+independent_segments is present for hwAccel=${hwAccel}`, () => {
      const args = buildFfmpegArgs({ ...BASE_OPTS, hwAccel })
      expect(flagValue(args, '-hls_flags')).toBe('delete_segments+append_list+independent_segments')
    })
  }
})

// ---------------------------------------------------------------------------
// outputDir reflected in segment filename and playlist path
// ---------------------------------------------------------------------------

describe('outputDir is reflected in output paths', () => {
  const dir = '/app/data/hls/my-session-abc'
  const args = buildFfmpegArgs({ ...BASE_OPTS, hwAccel: 'none', outputDir: dir })

  test('-hls_segment_filename contains outputDir', () => {
    const val = flagValue(args, '-hls_segment_filename')
    expect(val).toStartWith(dir)
  })

  test('playlist.m3u8 path is last arg and contains outputDir', () => {
    const last = args[args.length - 1]
    expect(last).toBe(`${dir}/playlist.m3u8`)
  })
})

// ---------------------------------------------------------------------------
// Numeric parameters reflected in FFmpeg flags
// ---------------------------------------------------------------------------

describe('numeric parameters are reflected in FFmpeg flags', () => {
  const args = buildFfmpegArgs({
    hwAccel: 'none',
    outputDir: '/tmp/sess',
    segmentSeconds: 4,
    listSize: 10,
    videoBitrate: 6000,
    audioBitrate: 192
  })

  test('-hls_time reflects segmentSeconds', () => {
    expect(flagValue(args, '-hls_time')).toBe('4')
  })

  test('-hls_list_size reflects listSize', () => {
    expect(flagValue(args, '-hls_list_size')).toBe('10')
  })

  test('-b:v reflects videoBitrate in kbps', () => {
    expect(flagValue(args, '-b:v')).toBe('6000k')
  })

  test('-b:a reflects audioBitrate in kbps', () => {
    expect(flagValue(args, '-b:a')).toBe('192k')
  })
})

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

describe('defaults', () => {
  const args = buildFfmpegArgs({ hwAccel: 'none', outputDir: '/tmp/sess' })

  test('default segmentSeconds is 2', () => {
    expect(flagValue(args, '-hls_time')).toBe('2')
  })

  test('default listSize is 6', () => {
    expect(flagValue(args, '-hls_list_size')).toBe('6')
  })

  test('default videoBitrate is 4000k', () => {
    expect(flagValue(args, '-b:v')).toBe('4000k')
  })

  test('default audioBitrate is 128k', () => {
    expect(flagValue(args, '-b:a')).toBe('128k')
  })
})

// ---------------------------------------------------------------------------
// Input and stream mapping
// ---------------------------------------------------------------------------

describe('input and stream mapping', () => {
  const args = buildFfmpegArgs({ ...BASE_OPTS, hwAccel: 'none' })

  test('input is pipe:0', () => {
    expect(flagValue(args, '-i')).toBe('pipe:0')
  })

  test('maps first video stream', () => {
    const mapIdx = args.indexOf('-map')
    expect(args[mapIdx + 1]).toBe('0:v:0')
  })

  test('maps first audio stream', () => {
    const secondMapIdx = args.indexOf('-map', args.indexOf('-map') + 1)
    expect(args[secondMapIdx + 1]).toBe('0:a:0')
  })

  test('-y overwrite flag is present', () => {
    expect(contains(args, '-y')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Recording (TS copy)
// ---------------------------------------------------------------------------

describe('buildRecordArgs', () => {
  const args = buildRecordArgs({ outputPath: '/rec/abc.ts' })

  test('uses stdin input', () => {
    expect(flagValue(args, '-i')).toBe('pipe:0')
  })

  test('copies streams (no re-encode)', () => {
    expect(flagValue(args, '-c')).toBe('copy')
  })

  test('forces mpegts container', () => {
    expect(flagValue(args, '-f')).toBe('mpegts')
  })

  test('maps all streams', () => {
    expect(flagValue(args, '-map')).toBe('0')
  })

  test('emits to the configured path', () => {
    expect(args[args.length - 1]).toBe('/rec/abc.ts')
  })

  test('does not include any encoder flags', () => {
    expect(contains(args, '-c:v')).toBe(false)
    expect(contains(args, '-c:a')).toBe(false)
    expect(contains(args, '-b:v')).toBe(false)
    expect(contains(args, '-hwaccel')).toBe(false)
    expect(contains(args, '-preset')).toBe(false)
  })

  test('-y overwrite flag is present', () => {
    expect(contains(args, '-y')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Conversion (.ts → .mp4 / .webm)
// ---------------------------------------------------------------------------

describe('buildConvertArgs avc + nvenc', () => {
  const args = buildConvertArgs({
    inputPath: '/rec/src.ts',
    outputPath: '/rec/out.mp4',
    hwAccel: 'nvenc',
    codec: 'avc'
  })

  test('uses h264_nvenc', () => {
    expect(flagValue(args, '-c:v')).toBe('h264_nvenc')
  })

  test('hw pre-input uses cuda', () => {
    expect(flagValue(args, '-hwaccel')).toBe('cuda')
  })

  test('audio codec is aac', () => {
    expect(flagValue(args, '-c:a')).toBe('aac')
  })

  test('container is mp4 with faststart', () => {
    expect(flagValue(args, '-f')).toBe('mp4')
    expect(flagValue(args, '-movflags')).toBe('+faststart')
  })

  test('preserves input path', () => {
    expect(flagValue(args, '-i')).toBe('/rec/src.ts')
  })

  test('emits to output path', () => {
    expect(args[args.length - 1]).toBe('/rec/out.mp4')
  })
})

describe('buildConvertArgs hevc + vaapi', () => {
  const args = buildConvertArgs({
    inputPath: '/rec/src.ts',
    outputPath: '/rec/out.mp4',
    hwAccel: 'vaapi',
    codec: 'hevc'
  })

  test('uses hevc_vaapi', () => {
    expect(flagValue(args, '-c:v')).toBe('hevc_vaapi')
  })

  test('includes vaapi_device before input', () => {
    const devIdx = args.indexOf('-vaapi_device')
    const inputIdx = args.indexOf('-i')
    expect(devIdx).toBeGreaterThan(-1)
    expect(devIdx).toBeLessThan(inputIdx)
  })

  test('includes nv12 upload filter', () => {
    expect(flagValue(args, '-vf')).toBe('format=nv12,hwupload')
  })
})

describe('buildConvertArgs hevc + none (libx265)', () => {
  const args = buildConvertArgs({
    inputPath: '/rec/src.ts',
    outputPath: '/rec/out.mp4',
    hwAccel: 'none',
    codec: 'hevc'
  })

  test('falls back to libx265', () => {
    expect(flagValue(args, '-c:v')).toBe('libx265')
  })
})

describe('buildConvertArgs vp9', () => {
  const args = buildConvertArgs({
    inputPath: '/rec/src.ts',
    outputPath: '/rec/out.webm',
    hwAccel: 'nvenc', // should be ignored — vp9 has no HW path
    codec: 'vp9'
  })

  test('always uses libvpx-vp9 (ignores hwAccel)', () => {
    expect(flagValue(args, '-c:v')).toBe('libvpx-vp9')
  })

  test('audio codec is opus', () => {
    expect(flagValue(args, '-c:a')).toBe('libopus')
  })

  test('container is webm', () => {
    expect(flagValue(args, '-f')).toBe('webm')
  })

  test('does not include -hwaccel flags', () => {
    expect(contains(args, '-hwaccel')).toBe(false)
    expect(contains(args, '-vaapi_device')).toBe(false)
  })
})

describe('buildConvertArgs avc + none', () => {
  const args = buildConvertArgs({
    inputPath: '/rec/src.ts',
    outputPath: '/rec/out.mp4',
    hwAccel: 'none',
    codec: 'avc',
    videoBitrate: 3000,
    audioBitrate: 192
  })

  test('uses libx264 at medium preset (not veryfast — this is batch, not live)', () => {
    expect(flagValue(args, '-c:v')).toBe('libx264')
    expect(flagValue(args, '-preset')).toBe('medium')
  })

  test('passes through custom bitrates', () => {
    expect(flagValue(args, '-b:v')).toBe('3000k')
    expect(flagValue(args, '-b:a')).toBe('192k')
  })
})

// ---------------------------------------------------------------------------
// Thumbnail
// ---------------------------------------------------------------------------

describe('buildThumbnailArgs', () => {
  const args = buildThumbnailArgs({
    inputPath: '/rec/abc.ts',
    outputPath: '/thumbs/abc.jpg'
  })

  test('seeks to atSeconds before input (fast seek on keyframes)', () => {
    const ssIdx = args.indexOf('-ss')
    const inputIdx = args.indexOf('-i')
    expect(ssIdx).toBeGreaterThan(-1)
    expect(ssIdx).toBeLessThan(inputIdx)
  })

  test('defaults to 60 seconds', () => {
    expect(flagValue(args, '-ss')).toBe('60')
  })

  test('extracts exactly one frame', () => {
    expect(flagValue(args, '-vframes')).toBe('1')
  })

  test('scales to default width 480', () => {
    expect(flagValue(args, '-vf')).toBe('scale=480:-1')
  })

  test('emits image2 format', () => {
    expect(flagValue(args, '-f')).toBe('image2')
  })

  test('custom atSeconds + width flow through', () => {
    const custom = buildThumbnailArgs({
      inputPath: '/a.ts',
      outputPath: '/b.jpg',
      atSeconds: 30,
      width: 320
    })
    expect(flagValue(custom, '-ss')).toBe('30')
    expect(flagValue(custom, '-vf')).toBe('scale=320:-1')
  })
})

// ---------------------------------------------------------------------------
// Dummy live source (lavfi → HLS)
// ---------------------------------------------------------------------------

describe('buildDummyLiveArgs', () => {
  test('uses lavfi testsrc + sine inputs and writes playlist to outputDir', () => {
    const args = buildDummyLiveArgs({ outputDir: '/tmp/test-session' })
    expect(args).toContain('-f')
    expect(args.some((a) => a.startsWith('testsrc2=size='))).toBe(true)
    expect(args.some((a) => a.startsWith('sine=frequency='))).toBe(true)
    expect(args[args.length - 1]).toBe('/tmp/test-session/playlist.m3u8')
  })

  test('quality=high → 1920x1080', () => {
    const args = buildDummyLiveArgs({ outputDir: '/x', quality: 'high' })
    const src = args.find((a) => a.startsWith('testsrc2=size='))
    expect(src).toContain('1920x1080')
  })

  test('quality=low → 854x480', () => {
    const args = buildDummyLiveArgs({ outputDir: '/x', quality: 'low' })
    expect(args.find((a) => a.startsWith('testsrc2=size='))).toContain('854x480')
  })

  test('codec=avc → libx264 + TS segments + aac audio', () => {
    const args = buildDummyLiveArgs({ outputDir: '/x', codec: 'avc' })
    expect(flagValue(args, '-c:v')).toBe('libx264')
    expect(flagValue(args, '-c:a')).toBe('aac')
    expect(args.some((a) => a.endsWith('.ts'))).toBe(true)
    expect(args).not.toContain('fmp4')
  })

  test('codec=hevc → libx265 + TS segments', () => {
    const args = buildDummyLiveArgs({ outputDir: '/x', codec: 'hevc' })
    expect(flagValue(args, '-c:v')).toBe('libx265')
    expect(args.some((a) => a.endsWith('.ts'))).toBe(true)
  })

  test('codec=vp9 → libvpx-vp9 + fMP4 segments + opus audio', () => {
    const args = buildDummyLiveArgs({ outputDir: '/x', codec: 'vp9' })
    expect(flagValue(args, '-c:v')).toBe('libvpx-vp9')
    expect(flagValue(args, '-c:a')).toBe('libopus')
    expect(flagValue(args, '-hls_segment_type')).toBe('fmp4')
    expect(args.some((a) => a.endsWith('.m4s'))).toBe(true)
  })

  test('-re is present so output pacing matches wall clock (live feel)', () => {
    const args = buildDummyLiveArgs({ outputDir: '/x' })
    expect(contains(args, '-re')).toBe(true)
  })

  test('keyframe interval = segmentSeconds × fps so HLS cuts cleanly', () => {
    const args = buildDummyLiveArgs({ outputDir: '/x', segmentSeconds: 2 })
    expect(flagValue(args, '-g')).toBe('60') // 2s * 30fps
  })
})
