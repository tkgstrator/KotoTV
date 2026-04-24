// FFmpeg command builder — pure function, no side effects.
// All encoder flag tuning lives here; never inline flags in transcoder.ts.

import { existsSync, readdirSync } from 'node:fs'
import { env } from './config'
import { logger } from './logger'

const vaapiLogger = logger.child({ module: 'ffmpeg-vaapi' })

// ---------------------------------------------------------------------------
// VAAPI render-node resolution — cached per-process
// ---------------------------------------------------------------------------

let cachedVaapiDevice: string | undefined

/**
 * Resolve the VAAPI render-node path to pass to FFmpeg.
 *
 * Priority:
 *   1. VAAPI_DEVICE env if it exists on disk.
 *   2. /dev/dri/renderD128 (historical default) if it exists.
 *   3. The first /dev/dri/renderD* node present at lookup time.
 *   4. Fall back to the configured VAAPI_DEVICE value even if missing — let
 *      FFmpeg produce the "No VA display found" error so the operator sees a
 *      concrete reason.
 *
 * Cached per-process: resolved once on first call. The render-node layout
 * doesn't change without a reboot, and re-scanning /dev/dri on every FFmpeg
 * spawn is wasted syscalls.
 */
export function resolveVaapiDevice(fsOverride?: {
  existsSync: (p: string) => boolean
  readdirSync: (p: string) => string[]
}): string {
  if (cachedVaapiDevice !== undefined) return cachedVaapiDevice

  const fs = fsOverride ?? { existsSync, readdirSync: (p: string) => readdirSync(p) as string[] }

  const configured = env.VAAPI_DEVICE

  // Priority 1: env-configured path exists on disk
  if (fs.existsSync(configured)) {
    cachedVaapiDevice = configured
    vaapiLogger.info({ device: cachedVaapiDevice }, 'VAAPI render node resolved (env-configured)')
    return cachedVaapiDevice
  }

  // Scan /dev/dri for renderD* nodes
  let renderNodes: string[] = []
  try {
    renderNodes = fs.readdirSync('/dev/dri').filter((e) => /^renderD\d+$/.test(e))
    renderNodes.sort()
  } catch {
    // /dev/dri does not exist or is not readable — fall through to fallback
  }

  // Priority 2: historical default renderD128 if present
  if (renderNodes.includes('renderD128')) {
    cachedVaapiDevice = '/dev/dri/renderD128'
    vaapiLogger.info({ device: cachedVaapiDevice }, 'VAAPI render node resolved (renderD128 found on disk)')
    return cachedVaapiDevice
  }

  // Priority 3: first available renderD* node
  if (renderNodes.length > 0) {
    cachedVaapiDevice = `/dev/dri/${renderNodes[0]}`
    vaapiLogger.info({ device: cachedVaapiDevice }, 'VAAPI render node resolved (first available node)')
    return cachedVaapiDevice
  }

  // Priority 4: fall back to configured value so FFmpeg surfaces a clear error
  cachedVaapiDevice = configured
  vaapiLogger.info(
    { device: cachedVaapiDevice },
    'VAAPI render node not found on disk — using configured value; FFmpeg will surface the error'
  )
  return cachedVaapiDevice
}

/** Reset the per-process VAAPI device cache. For tests only. */
export function _resetVaapiDeviceCacheForTests(): void {
  cachedVaapiDevice = undefined
}

export type HwAccel = 'none' | 'nvenc' | 'qsv' | 'vaapi'
export type Codec = 'avc' | 'hevc'
export type Quality = 'low' | 'mid' | 'high'
export type RateControl = 'cbr' | 'vbr' | 'cqp'

// Recording-only resolution types. Live path never uses these.
export type Resolution = 'hd1080' | 'hd720' | 'sd480'
export const RESOLUTION_DIMENSIONS: Record<Resolution, { width: number; height: number }> = {
  hd1080: { width: 1920, height: 1080 },
  hd720: { width: 1280, height: 720 },
  sd480: { width: 854, height: 480 }
}

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
  /**
   * Recording-only. When false, apply a scale filter to the target resolution.
   * Live path (streamManager.acquireLive / transcoder.ts) must NOT pass this field.
   * Default: true (preserve source resolution, same as legacy behaviour).
   */
  keepOriginalResolution?: boolean
  /**
   * Recording-only. Only consulted when keepOriginalResolution === false.
   * Live path must NOT pass this field.
   */
  resolution?: Resolution
  /**
   * Rate-control mode. Default: 'vbr'.
   * Live path defaults are VBR so flag output is byte-identical to pre-refactor.
   */
  rateControl?: RateControl
  /** QP/CQ value used when rateControl === 'cqp'. Default: 23. */
  qpValue?: number
}

/**
 * Build the FFmpeg argument array for a live HLS transcode session.
 *
 * Input is always `pipe:0` (stdin); the caller is responsible for piping
 * the Mirakc MPEG-TS stream into the spawned process.
 *
 * LIVE-PATH GUARD: keepOriginalResolution and resolution are recording-only.
 * Live callers must not pass them. See plan: encode-profile-resolution-and-benchmark.md
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
  const keepOriginalResolution = opts.keepOriginalResolution !== false
  const rateControl = opts.rateControl ?? 'vbr'
  const qpValue = opts.qpValue ?? 23

  // -y: overwrite output files without prompting (safe on tmpfs session dirs)
  const overwrite = ['-y']

  // Hardware-accelerator-specific flags that must appear before -i
  const hwPreInput = buildHwPreInput(hwAccel)

  const input = ['-i', 'pipe:0']

  // Map first video and audio stream; ignore any additional PIDs in the TS
  const mapping = ['-map', '0:v:0', '-map', '0:a:0']

  // Resolution, frame-rate scaling, and keyframe interval — common to all codecs.
  // GOP = fps * segmentSeconds lines up one keyframe per HLS segment, which
  // minimises libx264 I-frame work while still letting `-hls_time` cut clean
  // segment boundaries. libx264 defaults to GOP 250 (~8s) without this.
  const gop = preset.fps * segmentSeconds

  // When keepOriginalResolution is false (recording path only), drop -s and let
  // the scale filter handle dimensions. When true (live path default), keep -s
  // from the quality preset so existing behaviour is preserved.
  const sizeFlag = keepOriginalResolution ? ['-s', `${preset.width}x${preset.height}`] : []

  const scaleFlags = [
    ...sizeFlag,
    '-r',
    String(preset.fps),
    '-g',
    String(gop),
    '-keyint_min',
    String(gop),
    '-sc_threshold',
    '0'
  ]

  const videoFlags = buildVideoFlags(
    hwAccel,
    codec,
    videoBitrate,
    rateControl,
    qpValue,
    keepOriginalResolution,
    keepOriginalResolution ? undefined : opts.resolution
  )

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

export type RecordArgsOptions = {
  /** Absolute path to the output .tmp.mp4 file. Caller renames to .mp4 on success. */
  outputPath: string
}

/**
 * Build FFmpeg args for stream-copy recording (no re-encode, just remux to MP4).
 * Input is always pipe:0.
 * `-movflags +faststart` moves the moov atom to the front of the file on finalise;
 * this is safe because we write to a .tmp.mp4 then rename on completion, giving
 * FFmpeg a chance to flush the full atom before the caller does the rename.
 */
export function buildRecordArgs(opts: RecordArgsOptions): string[] {
  return ['-i', 'pipe:0', '-c', 'copy', '-f', 'mp4', '-movflags', '+faststart', '-y', opts.outputPath]
}

export type RecordingHlsArgsOptions = {
  /** Absolute path to the recorded MP4 file used as input. */
  inputPath: string
  /** Absolute path to the session HLS output directory (must exist before FFmpeg starts). */
  outputDir: string
  codec: Codec
  quality: Quality
  hwAccel: HwAccel
  /** Video bitrate override in kbps. Defaults from quality preset. */
  videoBitrate?: number
  /** Audio bitrate in kbps. Default: 128. */
  audioBitrate?: number
  /** Length of each HLS segment in seconds. Default: 2. */
  segmentSeconds?: number
}

/**
 * Build FFmpeg args for transcoding a recording file to VOD HLS.
 * Input is a file path (not pipe:0).
 * Uses -hls_playlist_type vod and -hls_list_size 0 so all segments are retained.
 * No -re flag: transcode as fast as possible (not live rate).
 */
export function buildRecordingHlsArgs(opts: RecordingHlsArgsOptions): string[] {
  const { inputPath, outputDir, codec, quality, hwAccel, audioBitrate = 128, segmentSeconds = 2 } = opts

  const preset = QUALITY_PRESETS[quality]
  const videoBitrate = opts.videoBitrate ?? preset.bitrate

  const overwrite = ['-y']
  const hwPreInput = buildHwPreInput(hwAccel)
  const input = ['-i', inputPath]
  const mapping = ['-map', '0:v:0', '-map', '0:a:0']

  const gop = preset.fps * segmentSeconds
  const scaleFlags = [
    '-s',
    `${preset.width}x${preset.height}`,
    '-r',
    String(preset.fps),
    '-g',
    String(gop),
    '-keyint_min',
    String(gop),
    '-sc_threshold',
    '0'
  ]

  // VBR is a safe default for VOD; no CQP/CBR variants needed here
  const videoFlags = buildVideoFlags(hwAccel, codec, videoBitrate, 'vbr', 23, true)
  const audioFlags = ['-c:a', 'aac', '-b:a', `${audioBitrate}k`]

  const hlsFlags = [
    '-f',
    'hls',
    '-hls_time',
    String(segmentSeconds),
    '-hls_list_size',
    '0',
    '-hls_playlist_type',
    'vod',
    '-hls_flags',
    'independent_segments',
    '-hls_segment_filename',
    `${outputDir}/%04d.ts`,
    `${outputDir}/playlist.m3u8`
  ]

  return [...overwrite, ...hwPreInput, ...input, ...mapping, ...scaleFlags, ...videoFlags, ...audioFlags, ...hlsFlags]
}

export type BenchmarkArgsOptions = {
  hwAccel: HwAccel
  codec: Codec
  rateControl: RateControl
  bitrateKbps: number
  qpValue: number
  keepOriginalResolution: boolean
  resolution: Resolution
  /** Duration in seconds for the synthetic source. Default: 5. */
  durationSec?: number
}

/**
 * Build the FFmpeg argument array for an encode-profile benchmark run.
 *
 * Uses a synthetic testsrc2 input (no Mirakc stream needed).
 * Output is discarded (-f null -) so no filesystem writes occur.
 * Audio is suppressed (-an) since we only benchmark the video encoder.
 *
 * Shares buildHwPreInput and buildVideoFlags with the recording path so
 * rate-control and scale flags are guaranteed identical — drift is impossible
 * by construction.
 */
export function buildBenchmarkArgs(opts: BenchmarkArgsOptions): string[] {
  const { hwAccel, codec, rateControl, bitrateKbps, qpValue, durationSec = 5 } = opts

  // Benchmark ALWAYS encodes at 1920x1080@30 regardless of the profile's
  // target resolution. Scaling down to 720p/480p hides the encoder workload
  // the question we actually want answered is "can this hardware do 1080p
  // realtime?". The profile's target resolution is still captured in the
  // BenchmarkLog row for display in the history table.
  // See: docs/plans/encode-profile-resolution-and-benchmark.md Decisions #3
  const input = ['-y', '-f', 'lavfi', '-i', `testsrc2=duration=${durationSec}:size=1920x1080:rate=30`]

  const hwPreInput = buildHwPreInput(hwAccel)

  // Force keepOriginalResolution=true so no scale filter is inserted; the
  // encoder processes the full 1080p source.
  const videoFlags = buildVideoFlags(hwAccel, codec, bitrateKbps, rateControl, qpValue, true, 'hd1080')

  const noAudio = ['-an']
  const nullOutput = ['-f', 'null', '-']

  return [...input, ...hwPreInput, ...videoFlags, ...noAudio, ...nullOutput]
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
      // vaapi_device must be set before the input; path is auto-resolved
      return ['-vaapi_device', resolveVaapiDevice()]
    default:
      return []
  }
}

/**
 * Build video codec flags for the given (hwAccel, codec) matrix cell.
 *
 * LIVE-PATH GUARD: keepOriginalResolution and resolution are recording-only.
 * Live callers (streamManager.acquireLive / transcoder.ts) must not pass them.
 *
 * Matrix:
 *   codec | none        | nvenc        | qsv        | vaapi
 *   avc   | libx264     | h264_nvenc   | h264_qsv   | h264_vaapi
 *   hevc  | libx265     | hevc_nvenc   | hevc_qsv   | hevc_vaapi
 *
 * HEVC cells always append -tag:v hvc1 for iOS Safari / hls.js compatibility.
 * VAAPI always prepends -vf format=nv12,hwupload before -c:v (ONE -vf flag;
 * FFmpeg keeps only the last -vf, so the scale filter must be concatenated
 * into the same chain rather than added as a second -vf).
 */
function buildVideoFlags(
  hwAccel: HwAccel,
  codec: Codec,
  videoBitrate: number,
  rateControl: RateControl = 'vbr',
  qpValue = 23,
  keep = true,
  resolution?: Resolution
): string[] {
  const hevcTag = codec === 'hevc' ? ['-tag:v', 'hvc1'] : []
  const rcFlags = buildRateControlFlags(hwAccel, rateControl, videoBitrate, qpValue)

  const dims = resolution ? RESOLUTION_DIMENSIONS[resolution] : RESOLUTION_DIMENSIONS.hd720

  switch (hwAccel) {
    case 'nvenc': {
      const encoder = codec === 'hevc' ? 'hevc_nvenc' : 'h264_nvenc'
      const scaleFilter = keep ? [] : ['-vf', `scale_cuda=${dims.width}:${dims.height}`]
      return [...scaleFilter, '-c:v', encoder, '-preset', 'p4', ...hevcTag, ...rcFlags]
    }
    case 'qsv': {
      const encoder = codec === 'hevc' ? 'hevc_qsv' : 'h264_qsv'
      const scaleFilter = keep ? [] : ['-vf', `scale_qsv=w=${dims.width}:h=${dims.height}`]
      return [...scaleFilter, '-c:v', encoder, '-preset', 'veryfast', ...hevcTag, ...rcFlags]
    }
    case 'vaapi': {
      const encoder = codec === 'hevc' ? 'hevc_vaapi' : 'h264_vaapi'
      // VAAPI: must be a single -vf chain. Adding a second -vf silently drops
      // the hwupload step, breaking the upload path entirely.
      const vfValue = keep
        ? 'format=nv12,hwupload'
        : `format=nv12,hwupload,scale_vaapi=w=${dims.width}:h=${dims.height}`
      return ['-vf', vfValue, '-c:v', encoder, ...hevcTag, ...rcFlags]
    }
    default: {
      // Software fallback. `veryfast` keeps realtime on 720p AVC on any
      // modern CPU; HEVC stays veryfast too — if CPU can't keep up, prefer
      // HW accel (nvenc / qsv / vaapi) over a worse preset.
      const scaleFilter = keep ? [] : ['-vf', `scale=${dims.width}:${dims.height}:flags=bicubic`]
      if (codec === 'hevc') {
        return [
          ...scaleFilter,
          '-c:v',
          'libx265',
          '-preset',
          'veryfast',
          '-tune',
          'zerolatency',
          '-tag:v',
          'hvc1',
          ...rcFlags
        ]
      }
      return [...scaleFilter, '-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'zerolatency', ...rcFlags]
    }
  }
}

/**
 * Translate (rateControl, bitrateKbps, qpValue) into concrete FFmpeg flags.
 *
 * Rate-control flag matrix (N = bitrateKbps, Q = qpValue):
 *
 *   rateControl | all hwAccels
 *   vbr         | -b:v Nk -maxrate:v (1.5N)k -bufsize (2N)k
 *   cbr         | -b:v Nk -minrate:v Nk -maxrate:v Nk -bufsize (2N)k
 *   cqp (cpu/vaapi)  | -qp Q
 *   cqp (nvenc)      | -cq Q
 *   cqp (qsv)        | -global_quality Q
 *
 * For cqp, no -b:v is emitted; bitrate and quantizer flags are mutually exclusive.
 */
function buildRateControlFlags(
  hwAccel: HwAccel,
  rateControl: RateControl,
  bitrateKbps: number,
  qpValue: number
): string[] {
  const N = bitrateKbps
  switch (rateControl) {
    case 'vbr':
      return ['-b:v', `${N}k`, '-maxrate:v', `${Math.round(N * 1.5)}k`, '-bufsize', `${N * 2}k`]
    case 'cbr':
      return ['-b:v', `${N}k`, '-minrate:v', `${N}k`, '-maxrate:v', `${N}k`, '-bufsize', `${N * 2}k`]
    case 'cqp':
      switch (hwAccel) {
        case 'nvenc':
          return ['-cq', String(qpValue)]
        case 'qsv':
          return ['-global_quality', String(qpValue)]
        default:
          // cpu and vaapi both use -qp
          return ['-qp', String(qpValue)]
      }
  }
}
