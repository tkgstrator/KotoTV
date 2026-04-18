import { describe, expect, test } from 'bun:test'
import type { FfmpegArgsOptions } from './ffmpeg'
import { buildFfmpegArgs } from './ffmpeg'

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

describe('hwAccel: qsv', () => {
  const args = buildFfmpegArgs({ ...BASE_OPTS, hwAccel: 'qsv' })

  test('uses h264_qsv codec', () => {
    expect(flagValue(args, '-c:v')).toBe('h264_qsv')
  })

  test('includes -hwaccel qsv', () => {
    expect(flagValue(args, '-hwaccel')).toBe('qsv')
  })

  test('includes -preset veryfast', () => {
    expect(flagValue(args, '-preset')).toBe('veryfast')
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

  test('does not include -hwaccel cuda or qsv keyword', () => {
    // vaapi uses -vaapi_device instead of -hwaccel
    expect(contains(args, 'cuda')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// HLS flags invariant (tmpfs overflow prevention)
// ---------------------------------------------------------------------------

describe('HLS flags invariant', () => {
  for (const hwAccel of ['none', 'nvenc', 'qsv', 'vaapi'] as const) {
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
