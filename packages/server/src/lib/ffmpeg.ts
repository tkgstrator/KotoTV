// FFmpeg command builder — pure function, no side effects.
// All encoder tuning lives here; never inline flags in transcoder.ts.

export type HwAccel = 'none' | 'nvenc' | 'qsv' | 'vaapi'
export type Codec = 'avc' | 'hevc'
export type Quality = 'low' | 'mid' | 'high'

export type QualityPreset = {
  width: number
  height: number
  bitrate: number
  fps: number
}

export const QUALITY_PRESETS: Record<Quality, QualityPreset> = {
  low: { width: 854, height: 480, bitrate: 1500, fps: 30 },
  mid: { width: 1280, height: 720, bitrate: 3000, fps: 30 },
  high: { width: 1920, height: 1080, bitrate: 6000, fps: 30 }
} as const

/** Return a resolution string like "1280x720" for a given quality. */
export function resolutionFor(quality: Quality): string {
  const { width, height } = QUALITY_PRESETS[quality]
  return `${width}x${height}`
}

export type FfmpegArgsOptions = {
  /** Hardware acceleration backend. Dispatched by HW_ACCEL_TYPE env at call site. */
  hwAccel: HwAccel
  /** Video codec: 'avc' (H.264) or 'hevc' (H.265). */
  codec: Codec
  /** Quality preset determining resolution, bitrate, and fps. */
  quality: Quality
  /** Absolute path to the session HLS output directory (must exist before FFmpeg starts). */
  outputDir: string
  /** Length of each HLS segment in seconds. Default: 2. */
  segmentSeconds?: number
  /** Maximum number of segments kept in the playlist. Default: 6. */
  listSize?: number
  /** Video bitrate override in kbps. Defaults from quality preset. */
  videoBitrate?: number
  /** Audio bitrate in kbps (appended as `<n>k`). Default: 128. */
  audioBitrate?: number
}

/**
 * Build the FFmpeg argument array for a live HLS transcode session.
 *
 * Input is always `pipe:0` (stdin); the caller is responsible for piping
 * the Mirakc MPEG-TS stream into the spawned process.
 *
 * Argument order:
 *   -y → hwPreInput → -i pipe:0 → map → -s -r -c:v [-preset] [-tune] [-tag:v] -b:v → -c:a -b:a → -f hls …
 *
 * @returns Argument array suitable for `Bun.spawn(['ffmpeg', ...buildFfmpegArgs(opts)])`.
 */
export function buildFfmpegArgs(opts: FfmpegArgsOptions): string[] {
  const { hwAccel, codec, quality, outputDir, segmentSeconds = 2, listSize = 6, audioBitrate = 128 } = opts

  const preset = QUALITY_PRESETS[quality]
  const videoBitrate = opts.videoBitrate ?? preset.bitrate

  // -y: overwrite output files without prompting (safe on tmpfs session dirs)
  const overwrite = ['-y']

  // Hardware-accelerator-specific flags that must appear before -i
  const hwPreInput = buildHwPreInput(hwAccel)

  const input = ['-i', 'pipe:0']

  // Map first video and audio stream; ignore any additional PIDs in the TS
  const mapping = ['-map', '0:v:0', '-map', '0:a:0']

  // Resolution, frame-rate scaling, and keyframe interval — common to all codecs.
  // GOP = fps means a keyframe every second, so HLS segments land within a
  // segmentSeconds-sized window (otherwise libx264 defaults to GOP 250 ≈ 8s
  // and hls.js has to buffer whole 8-second segments before playback starts).
  const scaleFlags = [
    '-s',
    `${preset.width}x${preset.height}`,
    '-r',
    String(preset.fps),
    '-g',
    String(preset.fps),
    '-keyint_min',
    String(preset.fps),
    '-sc_threshold',
    '0'
  ]

  const videoFlags = buildVideoFlags(hwAccel, codec, videoBitrate)

  const audioFlags = ['-c:a', 'aac', '-b:a', `${audioBitrate}k`]

  // HLS muxer output
  const hlsFlags = [
    '-f',
    'hls',
    '-hls_time',
    String(segmentSeconds),
    '-hls_list_size',
    String(listSize),
    // delete_segments: prune old .ts files so tmpfs never fills
    // append_list:     keep appending to the playlist (live mode)
    // independent_segments: every segment can be decoded independently
    '-hls_flags',
    'delete_segments+append_list+independent_segments',
    '-hls_segment_filename',
    `${outputDir}/%04d.ts`,
    `${outputDir}/playlist.m3u8`
  ]

  return [...overwrite, ...hwPreInput, ...input, ...mapping, ...scaleFlags, ...videoFlags, ...audioFlags, ...hlsFlags]
}

// ---------------------------------------------------------------------------
// Internal helpers — not exported; tuning must go through FfmpegArgsOptions
// ---------------------------------------------------------------------------

function buildHwPreInput(hwAccel: HwAccel): string[] {
  switch (hwAccel) {
    case 'nvenc':
      return ['-hwaccel', 'cuda']
    case 'qsv':
      return ['-hwaccel', 'qsv']
    case 'vaapi':
      // vaapi_device must be set before the input
      return ['-vaapi_device', '/dev/dri/renderD128']
    default:
      return []
  }
}

/**
 * Build video codec flags for the given (hwAccel, codec) matrix cell.
 *
 * Matrix:
 *   codec | none        | nvenc        | qsv        | vaapi
 *   avc   | libx264     | h264_nvenc   | h264_qsv   | h264_vaapi
 *   hevc  | libx265     | hevc_nvenc   | hevc_qsv   | hevc_vaapi
 *
 * HEVC cells always append -tag:v hvc1 for iOS Safari / hls.js compatibility.
 * VAAPI always prepends -vf format=nv12,hwupload before -c:v.
 */
function buildVideoFlags(hwAccel: HwAccel, codec: Codec, videoBitrate: number): string[] {
  const hevcTag = codec === 'hevc' ? ['-tag:v', 'hvc1'] : []

  switch (hwAccel) {
    case 'nvenc': {
      const encoder = codec === 'hevc' ? 'hevc_nvenc' : 'h264_nvenc'
      return ['-c:v', encoder, '-preset', 'p4', ...hevcTag, '-b:v', `${videoBitrate}k`]
    }
    case 'qsv': {
      const encoder = codec === 'hevc' ? 'hevc_qsv' : 'h264_qsv'
      return ['-c:v', encoder, '-preset', 'veryfast', ...hevcTag, '-b:v', `${videoBitrate}k`]
    }
    case 'vaapi': {
      const encoder = codec === 'hevc' ? 'hevc_vaapi' : 'h264_vaapi'
      // -vf must come before -c:v for vaapi
      return ['-vf', 'format=nv12,hwupload', '-c:v', encoder, ...hevcTag, '-b:v', `${videoBitrate}k`]
    }
    default: {
      // software fallback
      if (codec === 'hevc') {
        return [
          '-c:v',
          'libx265',
          '-preset',
          'veryfast',
          '-tune',
          'zerolatency',
          '-tag:v',
          'hvc1',
          '-b:v',
          `${videoBitrate}k`
        ]
      }
      return ['-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'zerolatency', '-b:v', `${videoBitrate}k`]
    }
  }
}
