import { beforeEach, describe, expect, test } from 'bun:test'
import type { FfmpegArgsOptions } from './ffmpeg'
import {
  _resetVaapiDeviceCacheForTests,
  buildBenchmarkArgs,
  buildFfmpegArgs,
  QUALITY_PRESETS,
  resolutionFor,
  resolveVaapiDevice
} from './ffmpeg'

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

  test('includes -vaapi_device pointing at a /dev/dri/renderD* node', () => {
    // The exact node is auto-resolved; assert the path shape rather than a
    // hardcoded node number so the test passes on any host.
    expect(flagValue(args, '-vaapi_device')).toMatch(/^\/dev\/dri\/renderD\d+$/)
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

// ---------------------------------------------------------------------------
// Scale-filter cases (recording-only; live path never sets keepOriginalResolution)
// ---------------------------------------------------------------------------

describe('scale filter: keepOriginalResolution true (default) — no scale filter emitted', () => {
  for (const hwAccel of ['none', 'nvenc', 'qsv', 'vaapi'] as const) {
    test(`hwAccel=${hwAccel} with keepOriginalResolution:true emits no scale_* filter`, () => {
      const args = buildFfmpegArgs({ ...BASE_OPTS, hwAccel, keepOriginalResolution: true })
      expect(args.some((a) => a.startsWith('scale'))).toBe(false)
      expect(
        args.some(
          (a) =>
            a.includes('scale_cuda') || a.includes('scale_qsv') || a.includes('scale_vaapi') || a.startsWith('scale=')
        )
      ).toBe(false)
    })

    test(`hwAccel=${hwAccel} with keepOriginalResolution:true retains -s from quality preset`, () => {
      const args = buildFfmpegArgs({ ...BASE_OPTS, hwAccel, keepOriginalResolution: true, quality: 'mid' })
      expect(flagValue(args, '-s')).toBe('1280x720')
    })
  }
})

describe('scale filter: keepOriginalResolution omitted behaves as true (live-path compat)', () => {
  test('none hwAccel without keepOriginalResolution still emits -s', () => {
    const args = buildFfmpegArgs({ ...BASE_OPTS, hwAccel: 'none' })
    expect(flagValue(args, '-s')).toBe('1280x720')
    expect(args.some((a) => a.includes('scale='))).toBe(false)
  })
})

describe('scale filter: keepOriginalResolution false — scale filter per hwAccel', () => {
  test('hwAccel=none, resolution=hd720 → -vf scale=1280:720:flags=bicubic', () => {
    const args = buildFfmpegArgs({ ...BASE_OPTS, hwAccel: 'none', keepOriginalResolution: false, resolution: 'hd720' })
    expect(flagValue(args, '-vf')).toBe('scale=1280:720:flags=bicubic')
    expect(contains(args, '-s')).toBe(false)
  })

  test('hwAccel=nvenc, resolution=hd1080 → -vf scale_cuda=1920:1080 before -c:v h264_nvenc', () => {
    const args = buildFfmpegArgs({
      ...BASE_OPTS,
      hwAccel: 'nvenc',
      keepOriginalResolution: false,
      resolution: 'hd1080'
    })
    expect(flagValue(args, '-vf')).toBe('scale_cuda=1920:1080')
    expect(args.indexOf('-vf')).toBeLessThan(args.indexOf('-c:v'))
    expect(flagValue(args, '-c:v')).toBe('h264_nvenc')
  })

  test('hwAccel=vaapi, resolution=sd480 → single -vf chain with scale_vaapi', () => {
    const args = buildFfmpegArgs({ ...BASE_OPTS, hwAccel: 'vaapi', keepOriginalResolution: false, resolution: 'sd480' })
    expect(flagValue(args, '-vf')).toBe('format=nv12,hwupload,scale_vaapi=w=854:h=480')
    // Must be exactly one -vf flag (not two)
    expect(args.filter((a) => a === '-vf').length).toBe(1)
  })

  test('hwAccel=qsv, resolution=hd720 → -vf scale_qsv=w=1280:h=720', () => {
    const args = buildFfmpegArgs({ ...BASE_OPTS, hwAccel: 'qsv', keepOriginalResolution: false, resolution: 'hd720' })
    expect(flagValue(args, '-vf')).toBe('scale_qsv=w=1280:h=720')
    expect(contains(args, '-s')).toBe(false)
  })

  test('ordering invariant: -vf appears before -c:v for all hwAccels', () => {
    for (const hwAccel of ['none', 'nvenc', 'qsv', 'vaapi'] as const) {
      const args = buildFfmpegArgs({ ...BASE_OPTS, hwAccel, keepOriginalResolution: false, resolution: 'hd720' })
      const vfIdx = args.indexOf('-vf')
      const cvIdx = args.indexOf('-c:v')
      expect(vfIdx).toBeGreaterThan(-1)
      expect(vfIdx).toBeLessThan(cvIdx)
    }
  })
})

// ---------------------------------------------------------------------------
// Rate-control flag matrix
// ---------------------------------------------------------------------------

describe('rate-control: vbr (default)', () => {
  test('none, bitrateKbps=4000 → -b:v 4000k, -maxrate:v 6000k, -bufsize 8000k; no -minrate:v', () => {
    const args = buildFfmpegArgs({ ...BASE_OPTS, hwAccel: 'none', rateControl: 'vbr', videoBitrate: 4000 })
    expect(flagValue(args, '-b:v')).toBe('4000k')
    expect(flagValue(args, '-maxrate:v')).toBe('6000k')
    expect(flagValue(args, '-bufsize')).toBe('8000k')
    expect(contains(args, '-minrate:v')).toBe(false)
  })

  test('nvenc, bitrateKbps=4000 → same vbr shape', () => {
    const args = buildFfmpegArgs({ ...BASE_OPTS, hwAccel: 'nvenc', rateControl: 'vbr', videoBitrate: 4000 })
    expect(flagValue(args, '-b:v')).toBe('4000k')
    expect(flagValue(args, '-maxrate:v')).toBe('6000k')
    expect(flagValue(args, '-bufsize')).toBe('8000k')
    expect(contains(args, '-minrate:v')).toBe(false)
  })

  test('qsv, bitrateKbps=4000 → same vbr shape', () => {
    const args = buildFfmpegArgs({ ...BASE_OPTS, hwAccel: 'qsv', rateControl: 'vbr', videoBitrate: 4000 })
    expect(flagValue(args, '-b:v')).toBe('4000k')
    expect(flagValue(args, '-maxrate:v')).toBe('6000k')
    expect(flagValue(args, '-bufsize')).toBe('8000k')
    expect(contains(args, '-minrate:v')).toBe(false)
  })

  test('vaapi, bitrateKbps=4000 → same vbr shape', () => {
    const args = buildFfmpegArgs({ ...BASE_OPTS, hwAccel: 'vaapi', rateControl: 'vbr', videoBitrate: 4000 })
    expect(flagValue(args, '-b:v')).toBe('4000k')
    expect(flagValue(args, '-maxrate:v')).toBe('6000k')
    expect(flagValue(args, '-bufsize')).toBe('8000k')
    expect(contains(args, '-minrate:v')).toBe(false)
  })
})

describe('rate-control: cbr', () => {
  test('none, bitrateKbps=4000 → -b:v 4000k, -minrate:v 4000k, -maxrate:v 4000k, -bufsize 8000k', () => {
    const args = buildFfmpegArgs({ ...BASE_OPTS, hwAccel: 'none', rateControl: 'cbr', videoBitrate: 4000 })
    expect(flagValue(args, '-b:v')).toBe('4000k')
    expect(flagValue(args, '-minrate:v')).toBe('4000k')
    expect(flagValue(args, '-maxrate:v')).toBe('4000k')
    expect(flagValue(args, '-bufsize')).toBe('8000k')
  })

  test('nvenc, bitrateKbps=4000 → cbr shape', () => {
    const args = buildFfmpegArgs({ ...BASE_OPTS, hwAccel: 'nvenc', rateControl: 'cbr', videoBitrate: 4000 })
    expect(flagValue(args, '-b:v')).toBe('4000k')
    expect(flagValue(args, '-minrate:v')).toBe('4000k')
    expect(flagValue(args, '-maxrate:v')).toBe('4000k')
    expect(flagValue(args, '-bufsize')).toBe('8000k')
  })

  test('qsv, bitrateKbps=4000 → cbr shape', () => {
    const args = buildFfmpegArgs({ ...BASE_OPTS, hwAccel: 'qsv', rateControl: 'cbr', videoBitrate: 4000 })
    expect(flagValue(args, '-b:v')).toBe('4000k')
    expect(flagValue(args, '-minrate:v')).toBe('4000k')
    expect(flagValue(args, '-maxrate:v')).toBe('4000k')
    expect(flagValue(args, '-bufsize')).toBe('8000k')
  })

  test('vaapi, bitrateKbps=4000 → cbr shape', () => {
    const args = buildFfmpegArgs({ ...BASE_OPTS, hwAccel: 'vaapi', rateControl: 'cbr', videoBitrate: 4000 })
    expect(flagValue(args, '-b:v')).toBe('4000k')
    expect(flagValue(args, '-minrate:v')).toBe('4000k')
    expect(flagValue(args, '-maxrate:v')).toBe('4000k')
    expect(flagValue(args, '-bufsize')).toBe('8000k')
  })
})

describe('rate-control: cqp — encoder-specific quantizer flag, no -b:v', () => {
  test('hwAccel=none, qpValue=22 → -qp 22; no -b:v', () => {
    const args = buildFfmpegArgs({ ...BASE_OPTS, hwAccel: 'none', rateControl: 'cqp', qpValue: 22 })
    expect(contains(args, '-qp')).toBe(true)
    expect(flagValue(args, '-qp')).toBe('22')
    expect(contains(args, '-b:v')).toBe(false)
  })

  test('hwAccel=nvenc, qpValue=22 → -cq 22; no -b:v', () => {
    const args = buildFfmpegArgs({ ...BASE_OPTS, hwAccel: 'nvenc', rateControl: 'cqp', qpValue: 22 })
    expect(contains(args, '-cq')).toBe(true)
    expect(flagValue(args, '-cq')).toBe('22')
    expect(contains(args, '-b:v')).toBe(false)
  })

  test('hwAccel=qsv, qpValue=22 → -global_quality 22; no -b:v', () => {
    const args = buildFfmpegArgs({ ...BASE_OPTS, hwAccel: 'qsv', rateControl: 'cqp', qpValue: 22 })
    expect(contains(args, '-global_quality')).toBe(true)
    expect(flagValue(args, '-global_quality')).toBe('22')
    expect(contains(args, '-b:v')).toBe(false)
  })

  test('hwAccel=vaapi, qpValue=22 → -qp 22; no -b:v', () => {
    const args = buildFfmpegArgs({ ...BASE_OPTS, hwAccel: 'vaapi', rateControl: 'cqp', qpValue: 22 })
    expect(contains(args, '-qp')).toBe(true)
    expect(flagValue(args, '-qp')).toBe('22')
    expect(contains(args, '-b:v')).toBe(false)
  })
})

describe('live-path parity: omitting recording fields preserves legacy flag set', () => {
  // VBR with preset bitrate should still include -b:v at the preset value.
  test('none/avc/mid without recording fields → -b:v 3000k, -maxrate:v 4500k, -bufsize 6000k', () => {
    const args = buildFfmpegArgs({ hwAccel: 'none', codec: 'avc', quality: 'mid', outputDir: '/tmp/sess' })
    expect(flagValue(args, '-b:v')).toBe('3000k')
    expect(flagValue(args, '-maxrate:v')).toBe('4500k')
    expect(flagValue(args, '-bufsize')).toBe('6000k')
    // No scale filter on live path
    expect(args.some((a) => a.startsWith('scale'))).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// buildBenchmarkArgs — step 5
// ---------------------------------------------------------------------------

describe('buildBenchmarkArgs: input format', () => {
  test('starts with -y -f lavfi -i testsrc2=duration=5:size=1920x1080:rate=30 (default duration)', () => {
    const args = buildBenchmarkArgs({
      hwAccel: 'none',
      codec: 'avc',
      rateControl: 'vbr',
      bitrateKbps: 4000,
      qpValue: 23,
      keepOriginalResolution: true,
      resolution: 'hd720'
    })
    expect(args[0]).toBe('-y')
    expect(args[1]).toBe('-f')
    expect(args[2]).toBe('lavfi')
    expect(args[3]).toBe('-i')
    expect(args[4]).toBe('testsrc2=duration=5:size=1920x1080:rate=30')
  })

  test('durationSec:10 → duration=10 in testsrc2 string', () => {
    const args = buildBenchmarkArgs({
      hwAccel: 'none',
      codec: 'avc',
      rateControl: 'vbr',
      bitrateKbps: 4000,
      qpValue: 23,
      keepOriginalResolution: true,
      resolution: 'hd720',
      durationSec: 10
    })
    expect(args[4]).toBe('testsrc2=duration=10:size=1920x1080:rate=30')
  })

  test('ends with -an -f null -', () => {
    const args = buildBenchmarkArgs({
      hwAccel: 'none',
      codec: 'avc',
      rateControl: 'vbr',
      bitrateKbps: 4000,
      qpValue: 23,
      keepOriginalResolution: true,
      resolution: 'hd720'
    })
    const n = args.length
    expect(args[n - 4]).toBe('-an')
    expect(args[n - 3]).toBe('-f')
    expect(args[n - 2]).toBe('null')
    expect(args[n - 1]).toBe('-')
  })
})

describe('buildBenchmarkArgs: parity with buildFfmpegArgs for rate-control + codec flags', () => {
  // The middle slice (between -i and -an) of buildBenchmarkArgs must share the
  // same -c:v, -preset, and rate-control flags as buildFfmpegArgs with keepOriginalResolution:true.
  function rateControlTail(args: string[]): string[] {
    // Returns everything from -c:v onward up to -c:a (live) or -an (bench).
    const cvIdx = args.indexOf('-c:v')
    const caIdx = args.indexOf('-c:a')
    const anIdx = args.indexOf('-an')
    const end = caIdx !== -1 ? caIdx : anIdx !== -1 ? anIdx : args.length
    return args.slice(cvIdx, end)
  }

  const fixedOpts = {
    hwAccel: 'none' as const,
    codec: 'avc' as const,
    rateControl: 'vbr' as const,
    bitrateKbps: 4000,
    qpValue: 23
  }

  test('none/vbr: benchmark and recording share -c:v, -preset, and rate-control flags', () => {
    const benchArgs = buildBenchmarkArgs({ ...fixedOpts, keepOriginalResolution: true, resolution: 'hd720' })
    const recArgs = buildFfmpegArgs({
      ...fixedOpts,
      quality: 'mid',
      outputDir: '/tmp',
      keepOriginalResolution: true,
      videoBitrate: 4000
    })
    expect(rateControlTail(benchArgs)).toEqual(rateControlTail(recArgs))
  })

  test('nvenc/cbr: same codec flags in both paths', () => {
    const opts = { ...fixedOpts, hwAccel: 'nvenc' as const, rateControl: 'cbr' as const }
    const benchArgs = buildBenchmarkArgs({ ...opts, keepOriginalResolution: true, resolution: 'hd720' })
    const recArgs = buildFfmpegArgs({
      ...opts,
      quality: 'mid',
      outputDir: '/tmp',
      keepOriginalResolution: true,
      videoBitrate: 4000
    })
    expect(rateControlTail(benchArgs)).toEqual(rateControlTail(recArgs))
  })

  test('benchmark middle slice contains hwPreInput before -c:v for nvenc', () => {
    const args = buildBenchmarkArgs({
      hwAccel: 'nvenc',
      codec: 'avc',
      rateControl: 'vbr',
      bitrateKbps: 4000,
      qpValue: 23,
      keepOriginalResolution: true,
      resolution: 'hd720'
    })
    // hwPreInput ('-hwaccel cuda') comes in between -i and -c:v
    const iIdx = args.indexOf('-i')
    const cvIdx = args.indexOf('-c:v')
    const hwIdx = args.indexOf('-hwaccel')
    expect(hwIdx).toBeGreaterThan(iIdx)
    expect(hwIdx).toBeLessThan(cvIdx)
  })
})

// ---------------------------------------------------------------------------
// resolveVaapiDevice — fs-injection tests
// ---------------------------------------------------------------------------

describe('resolveVaapiDevice', () => {
  // Reset the module-level cache before every test so each case starts fresh.
  beforeEach(() => {
    _resetVaapiDeviceCacheForTests()
  })

  /** Build a minimal fsOverride for the given set of present render nodes. */
  function makeFsOverride(presentNodes: string[]) {
    return {
      existsSync: (p: string) => presentNodes.map((n) => `/dev/dri/${n}`).includes(p),
      readdirSync: (_p: string) => presentNodes
    }
  }

  test('only renderD129 present → returns /dev/dri/renderD129', () => {
    const result = resolveVaapiDevice(makeFsOverride(['renderD129']))
    expect(result).toBe('/dev/dri/renderD129')
  })

  test('only renderD128 present → returns /dev/dri/renderD128', () => {
    const result = resolveVaapiDevice(makeFsOverride(['renderD128']))
    expect(result).toBe('/dev/dri/renderD128')
  })

  test('both renderD128 and renderD129 present, env default renderD128 → returns /dev/dri/renderD128', () => {
    // env.VAAPI_DEVICE defaults to /dev/dri/renderD128; existsSync returns true for it
    const result = resolveVaapiDevice(makeFsOverride(['renderD128', 'renderD129']))
    expect(result).toBe('/dev/dri/renderD128')
  })

  test('env says renderD200 (absent), only renderD129 exists → falls back to first existing /dev/dri/renderD129', () => {
    // env.VAAPI_DEVICE is /dev/dri/renderD128 (the default), renderD128 is absent
    // and only renderD129 is present — simulates the host described in the bug.
    const result = resolveVaapiDevice(makeFsOverride(['renderD129']))
    expect(result).toBe('/dev/dri/renderD129')
  })

  test('/dev/dri completely missing → returns configured default', () => {
    const fs = {
      existsSync: (_p: string) => false,
      readdirSync: (_p: string) => {
        throw new Error('ENOENT: /dev/dri')
      }
    }
    const result = resolveVaapiDevice(fs)
    // Must be the env-configured value (default /dev/dri/renderD128) so FFmpeg
    // surfaces the "No VA display found" error with a concrete path.
    expect(result).toMatch(/^\/dev\/dri\/renderD\d+$/)
  })

  test('result is cached — second call returns same value without re-scanning', () => {
    const fs = makeFsOverride(['renderD129'])
    const first = resolveVaapiDevice(fs)
    // Replace the fs impl with one that always throws; the cache must shield us
    const broken = {
      existsSync: () => false,
      readdirSync: () => {
        throw new Error('should not be called')
      }
    }
    const second = resolveVaapiDevice(broken)
    expect(second).toBe(first)
  })
})
