import { describe, expect, test } from 'bun:test'
import type { FfmpegArgsOptions } from './ffmpeg'
import { buildFfmpegArgs, QUALITY_PRESETS, resolutionFor } from './ffmpeg'

const BASE_OPTS = {
  outputDir: '/app/data/hls/test-session',
  segmentSeconds: 2,
  listSize: 6,
  codec: 'avc' as const,
  quality: 'mid' as const
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
// Codec × HwAccel matrix — -c:v and -tag:v hvc1
// ---------------------------------------------------------------------------

describe('codec × hwAccel matrix: AVC', () => {
  test('none → libx264', () => {
    const args = buildFfmpegArgs({ ...BASE_OPTS, hwAccel: 'none', codec: 'avc' })
    expect(flagValue(args, '-c:v')).toBe('libx264')
    expect(contains(args, 'hvc1')).toBe(false)
  })

  test('nvenc → h264_nvenc', () => {
    const args = buildFfmpegArgs({ ...BASE_OPTS, hwAccel: 'nvenc', codec: 'avc' })
    expect(flagValue(args, '-c:v')).toBe('h264_nvenc')
    expect(contains(args, 'hvc1')).toBe(false)
  })

  test('qsv → h264_qsv', () => {
    const args = buildFfmpegArgs({ ...BASE_OPTS, hwAccel: 'qsv', codec: 'avc' })
    expect(flagValue(args, '-c:v')).toBe('h264_qsv')
    expect(contains(args, 'hvc1')).toBe(false)
  })

  test('vaapi → h264_vaapi', () => {
    const args = buildFfmpegArgs({ ...BASE_OPTS, hwAccel: 'vaapi', codec: 'avc' })
    expect(flagValue(args, '-c:v')).toBe('h264_vaapi')
    expect(contains(args, 'hvc1')).toBe(false)
  })
})

describe('codec × hwAccel matrix: HEVC (-tag:v hvc1 required)', () => {
  test('none → libx265 + hvc1', () => {
    const args = buildFfmpegArgs({ ...BASE_OPTS, hwAccel: 'none', codec: 'hevc' })
    expect(flagValue(args, '-c:v')).toBe('libx265')
    expect(flagValue(args, '-tag:v')).toBe('hvc1')
  })

  test('nvenc → hevc_nvenc + hvc1', () => {
    const args = buildFfmpegArgs({ ...BASE_OPTS, hwAccel: 'nvenc', codec: 'hevc' })
    expect(flagValue(args, '-c:v')).toBe('hevc_nvenc')
    expect(flagValue(args, '-tag:v')).toBe('hvc1')
  })

  test('qsv → hevc_qsv + hvc1', () => {
    const args = buildFfmpegArgs({ ...BASE_OPTS, hwAccel: 'qsv', codec: 'hevc' })
    expect(flagValue(args, '-c:v')).toBe('hevc_qsv')
    expect(flagValue(args, '-tag:v')).toBe('hvc1')
  })

  test('vaapi → hevc_vaapi + hvc1', () => {
    const args = buildFfmpegArgs({ ...BASE_OPTS, hwAccel: 'vaapi', codec: 'hevc' })
    expect(flagValue(args, '-c:v')).toBe('hevc_vaapi')
    expect(flagValue(args, '-tag:v')).toBe('hvc1')
  })
})

// ---------------------------------------------------------------------------
// Quality presets — -s, -r, -b:v defaults
// ---------------------------------------------------------------------------

describe('quality preset: low', () => {
  const args = buildFfmpegArgs({ ...BASE_OPTS, hwAccel: 'none', codec: 'avc', quality: 'low' })

  test('-s is 854x480', () => {
    expect(flagValue(args, '-s')).toBe('854x480')
  })

  test('-r is 30', () => {
    expect(flagValue(args, '-r')).toBe('30')
  })

  test('-b:v defaults to 1500k', () => {
    expect(flagValue(args, '-b:v')).toBe('1500k')
  })
})

describe('quality preset: mid', () => {
  const args = buildFfmpegArgs({ ...BASE_OPTS, hwAccel: 'none', codec: 'avc', quality: 'mid' })

  test('-s is 1280x720', () => {
    expect(flagValue(args, '-s')).toBe('1280x720')
  })

  test('-r is 30', () => {
    expect(flagValue(args, '-r')).toBe('30')
  })

  test('-b:v defaults to 3000k', () => {
    expect(flagValue(args, '-b:v')).toBe('3000k')
  })
})

describe('quality preset: high', () => {
  const args = buildFfmpegArgs({ ...BASE_OPTS, hwAccel: 'none', codec: 'avc', quality: 'high' })

  test('-s is 1920x1080', () => {
    expect(flagValue(args, '-s')).toBe('1920x1080')
  })

  test('-r is 30', () => {
    expect(flagValue(args, '-r')).toBe('30')
  })

  test('-b:v defaults to 6000k', () => {
    expect(flagValue(args, '-b:v')).toBe('6000k')
  })
})

describe('videoBitrate override overrides quality preset default', () => {
  test('explicit videoBitrate takes precedence', () => {
    const args = buildFfmpegArgs({ ...BASE_OPTS, hwAccel: 'none', codec: 'avc', quality: 'low', videoBitrate: 999 })
    expect(flagValue(args, '-b:v')).toBe('999k')
  })
})

// ---------------------------------------------------------------------------
// resolutionFor helper
// ---------------------------------------------------------------------------

describe('resolutionFor()', () => {
  test('low → 854x480', () => expect(resolutionFor('low')).toBe('854x480'))
  test('mid → 1280x720', () => expect(resolutionFor('mid')).toBe('1280x720'))
  test('high → 1920x1080', () => expect(resolutionFor('high')).toBe('1920x1080'))
})

describe('QUALITY_PRESETS shape', () => {
  for (const [q, p] of Object.entries(QUALITY_PRESETS) as [
    string,
    (typeof QUALITY_PRESETS)[keyof typeof QUALITY_PRESETS]
  ][]) {
    test(`${q} has fps=30`, () => expect(p.fps).toBe(30))
  }
})

// ---------------------------------------------------------------------------
// HW accel — encoder codec selection (legacy coverage with new required fields)
// ---------------------------------------------------------------------------

describe('hwAccel: none (libx264)', () => {
  const args = buildFfmpegArgs({ ...BASE_OPTS, hwAccel: 'none', codec: 'avc' })

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

describe('hwAccel: nvenc (avc)', () => {
  const args = buildFfmpegArgs({ ...BASE_OPTS, hwAccel: 'nvenc', codec: 'avc' })

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

describe('hwAccel: qsv (avc)', () => {
  const args = buildFfmpegArgs({ ...BASE_OPTS, hwAccel: 'qsv', codec: 'avc' })

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

describe('hwAccel: vaapi (avc)', () => {
  const args = buildFfmpegArgs({ ...BASE_OPTS, hwAccel: 'vaapi', codec: 'avc' })

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
    expect(contains(args, 'cuda')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// HLS flags invariant (tmpfs overflow prevention)
// ---------------------------------------------------------------------------

describe('HLS flags invariant', () => {
  for (const hwAccel of ['none', 'nvenc', 'qsv', 'vaapi'] as const) {
    for (const codec of ['avc', 'hevc'] as const) {
      test(`delete_segments+append_list+independent_segments present for hwAccel=${hwAccel} codec=${codec}`, () => {
        const args = buildFfmpegArgs({ ...BASE_OPTS, hwAccel, codec })
        expect(flagValue(args, '-hls_flags')).toBe('delete_segments+append_list+independent_segments')
      })
    }
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
    codec: 'avc',
    quality: 'high',
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
  const args = buildFfmpegArgs({ hwAccel: 'none', codec: 'avc', quality: 'mid', outputDir: '/tmp/sess' })

  test('default segmentSeconds is 2', () => {
    expect(flagValue(args, '-hls_time')).toBe('2')
  })

  test('default listSize is 6', () => {
    expect(flagValue(args, '-hls_list_size')).toBe('6')
  })

  test('default audioBitrate is 128k', () => {
    expect(flagValue(args, '-b:a')).toBe('128k')
  })

  test('default videoBitrate for mid quality is 3000k', () => {
    expect(flagValue(args, '-b:v')).toBe('3000k')
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
// Argument order: -s and -r appear before -c:v
// ---------------------------------------------------------------------------

describe('argument ordering', () => {
  test('-s appears before -c:v', () => {
    const args = buildFfmpegArgs({ ...BASE_OPTS, hwAccel: 'none', codec: 'avc' })
    expect(args.indexOf('-s')).toBeLessThan(args.indexOf('-c:v'))
  })

  test('-r appears before -c:v', () => {
    const args = buildFfmpegArgs({ ...BASE_OPTS, hwAccel: 'none', codec: 'avc' })
    expect(args.indexOf('-r')).toBeLessThan(args.indexOf('-c:v'))
  })

  test('-hwaccel cuda appears before -i for nvenc', () => {
    const args = buildFfmpegArgs({ ...BASE_OPTS, hwAccel: 'nvenc', codec: 'avc' })
    expect(args.indexOf('-hwaccel')).toBeLessThan(args.indexOf('-i'))
  })
})
