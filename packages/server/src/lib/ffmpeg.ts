// FFmpeg command builder — pure function, no side effects.
// All encoder tuning lives here; never inline flags in transcoder.ts.

export type HwAccel = 'none' | 'nvenc' | 'vaapi'
export type LiveQuality = 'auto' | 'high' | 'medium' | 'low'
export type LiveCodec = 'avc' | 'hevc' | 'vp9'

const QUALITY_TO_RES: Record<LiveQuality, { w: number; h: number; videoBitrate: number }> = {
  auto: { w: 1280, h: 720, videoBitrate: 2500 },
  high: { w: 1920, h: 1080, videoBitrate: 4500 },
  medium: { w: 1280, h: 720, videoBitrate: 2500 },
  low: { w: 854, h: 480, videoBitrate: 900 }
}

export type FfmpegArgsOptions = {
  /** Hardware acceleration backend. Dispatched by HW_ACCEL_TYPE env at call site. */
  hwAccel: HwAccel
  /** Absolute path to the session HLS output directory (must exist before FFmpeg starts). */
  outputDir: string
  /** Length of each HLS segment in seconds. Default: 2. */
  segmentSeconds?: number
  /** Maximum number of segments kept in the playlist. Default: 6. */
  listSize?: number
  /** Video bitrate in kbps (appended as `<n>k`). Default: 4000. */
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
 * @returns Argument array suitable for `Bun.spawn(['ffmpeg', ...buildFfmpegArgs(opts)])`.
 */
export function buildFfmpegArgs(opts: FfmpegArgsOptions): string[] {
  const { hwAccel, outputDir, segmentSeconds = 2, listSize = 6, videoBitrate = 4000, audioBitrate = 128 } = opts

  // -y: overwrite output files without prompting (safe on tmpfs session dirs)
  const overwrite = ['-y']

  // Hardware-accelerator-specific flags that must appear before -i
  const hwPreInput = buildHwPreInput(hwAccel)

  const input = ['-i', 'pipe:0']

  // Map first video and audio stream; ignore any additional PIDs in the TS
  const mapping = ['-map', '0:v:0', '-map', '0:a:0']

  const videoFlags = buildVideoFlags(hwAccel, videoBitrate)

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

  return [...overwrite, ...hwPreInput, ...input, ...mapping, ...videoFlags, ...audioFlags, ...hlsFlags]
}

// ---------------------------------------------------------------------------
// Internal helpers — not exported; tuning must go through FfmpegArgsOptions
// ---------------------------------------------------------------------------

function buildHwPreInput(hwAccel: HwAccel): string[] {
  switch (hwAccel) {
    case 'nvenc':
      return ['-hwaccel', 'cuda']
    case 'vaapi':
      // vaapi_device must be set before the input. Intel iGPU users also
      // use this path (Intel QSV is deliberately not supported — VAAPI
      // hits the same hardware with a simpler toolchain).
      return ['-vaapi_device', '/dev/dri/renderD128']
    default:
      return []
  }
}

function buildVideoFlags(hwAccel: HwAccel, videoBitrate: number): string[] {
  switch (hwAccel) {
    case 'nvenc':
      return ['-c:v', 'h264_nvenc', '-preset', 'p4', '-b:v', `${videoBitrate}k`]
    case 'vaapi':
      return ['-vf', 'format=nv12,hwupload', '-c:v', 'h264_vaapi', '-b:v', `${videoBitrate}k`]
    default:
      return ['-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'zerolatency', '-b:v', `${videoBitrate}k`]
  }
}

// ---------------------------------------------------------------------------
// Recording: TS copy (no re-encode, HW encoder untouched)
// ---------------------------------------------------------------------------

export type RecordArgsOptions = {
  /** Absolute output path. Should end with .ts (MPEG-TS container). */
  outputPath: string
}

/**
 * Build the FFmpeg argument array for recording a live channel to MPEG-TS.
 *
 * Uses `-c copy -f mpegts` — no decode, no re-encode. This consumes
 * zero HW encoder sessions so the GPU stays free for live viewing.
 * The resulting .ts is converted to .mp4 afterward via `buildConvertArgs`.
 *
 * Input is `pipe:0` (stdin); caller pipes the Mirakc MPEG-TS into it.
 */
export function buildRecordArgs(opts: RecordArgsOptions): string[] {
  const { outputPath } = opts
  return [
    '-y',
    '-i',
    'pipe:0',
    // Copy all streams without re-encoding. Audio (AAC-LATM), video (H.264),
    // subtitles (ARIB captions), and PMT metadata are preserved verbatim.
    '-c',
    'copy',
    '-map',
    '0',
    '-f',
    'mpegts',
    outputPath
  ]
}

// ---------------------------------------------------------------------------
// Conversion: .ts → .mp4 / .webm (background queue, serial HW encode)
// ---------------------------------------------------------------------------

export type OutputCodec = 'avc' | 'hevc' | 'vp9'

export type ConvertArgsOptions = {
  /** Absolute input path (typically the .ts recorded by buildRecordArgs). */
  inputPath: string
  /** Absolute output path. Extension must match the codec (.mp4 for avc/hevc, .webm for vp9). */
  outputPath: string
  /** HW encoder backend. libx264 / libx265 / libvpx-vp9 when 'none'. */
  hwAccel: HwAccel
  /** Output video codec. Container is inferred (mp4 for avc/hevc, webm for vp9). */
  codec: OutputCodec
  /** Video bitrate in kbps. Default: 4000. */
  videoBitrate?: number
  /** Audio bitrate in kbps. Default: 128. */
  audioBitrate?: number
}

/**
 * Build the FFmpeg argument array for converting a recorded .ts file to
 * the final container (.mp4 or .webm) with HW-accelerated encoding.
 *
 * VP9 does not use NVEnc / VAAPI — always falls back to libvpx-vp9
 * because vp9 HW support in FFmpeg is patchy and not worth the branching.
 */
export function buildConvertArgs(opts: ConvertArgsOptions): string[] {
  const { inputPath, outputPath, hwAccel, codec, videoBitrate = 4000, audioBitrate = 128 } = opts

  const hwPreInput = buildHwPreInput(codec === 'vp9' ? 'none' : hwAccel)

  const input = ['-i', inputPath]

  // Same first-V / first-A mapping as the live transcode — ignore ancillary PIDs.
  const mapping = ['-map', '0:v:0', '-map', '0:a:0']

  const videoFlags = buildConvertVideoFlags(codec, codec === 'vp9' ? 'none' : hwAccel, videoBitrate)

  // AAC for MP4; Opus for WebM (VP9)
  const audioFlags =
    codec === 'vp9' ? ['-c:a', 'libopus', '-b:a', `${audioBitrate}k`] : ['-c:a', 'aac', '-b:a', `${audioBitrate}k`]

  // Container + fast-start (mp4 moov atom at head for immediate playback)
  const containerFlags = codec === 'vp9' ? ['-f', 'webm'] : ['-f', 'mp4', '-movflags', '+faststart']

  return ['-y', ...hwPreInput, ...input, ...mapping, ...videoFlags, ...audioFlags, ...containerFlags, outputPath]
}

function buildConvertVideoFlags(codec: OutputCodec, hwAccel: HwAccel, videoBitrate: number): string[] {
  const bv = ['-b:v', `${videoBitrate}k`]

  if (codec === 'vp9') {
    // libvpx-vp9 always (no HW path). Deadline=good+cpu-used=2 is a
    // sensible quality/speed trade-off for batch conversion.
    return ['-c:v', 'libvpx-vp9', '-deadline', 'good', '-cpu-used', '2', ...bv]
  }

  if (codec === 'hevc') {
    switch (hwAccel) {
      case 'nvenc':
        return ['-c:v', 'hevc_nvenc', '-preset', 'p5', ...bv]
      case 'vaapi':
        return ['-vf', 'format=nv12,hwupload', '-c:v', 'hevc_vaapi', ...bv]
      default:
        return ['-c:v', 'libx265', '-preset', 'medium', ...bv]
    }
  }

  // codec === 'avc'
  switch (hwAccel) {
    case 'nvenc':
      return ['-c:v', 'h264_nvenc', '-preset', 'p5', ...bv]
    case 'vaapi':
      return ['-vf', 'format=nv12,hwupload', '-c:v', 'h264_vaapi', ...bv]
    default:
      return ['-c:v', 'libx264', '-preset', 'medium', ...bv]
  }
}

// ---------------------------------------------------------------------------
// Thumbnail: single frame extraction for recording UI
// ---------------------------------------------------------------------------

export type ThumbnailArgsOptions = {
  inputPath: string
  outputPath: string
  /** Seek offset in seconds. Default: 60 (skip opening titles / black frames). */
  atSeconds?: number
  /** Output width in px; height preserves aspect. Default: 480. */
  width?: number
}

/**
 * Build the FFmpeg argument array for extracting a single representative
 * frame at `atSeconds` into a JPEG. `-ss` before `-i` uses fast seek on
 * keyframes — acceptable for thumbnails; slightly inaccurate but ~100x faster.
 */
export function buildThumbnailArgs(opts: ThumbnailArgsOptions): string[] {
  const { inputPath, outputPath, atSeconds = 60, width = 480 } = opts
  return [
    '-y',
    '-ss',
    String(atSeconds),
    '-i',
    inputPath,
    '-vframes',
    '1',
    '-vf',
    `scale=${width}:-1`,
    '-f',
    'image2',
    '-q:v',
    '3',
    outputPath
  ]
}

// ---------------------------------------------------------------------------
// Dummy live source — lavfi testsrc+sine → HLS, no upstream stream required.
// Used until Mirakc is wired; also handy for Playwright tests because the
// pipeline is self-contained and deterministic.
// ---------------------------------------------------------------------------

export type DummyLiveArgsOptions = {
  /** Absolute output dir. Must exist. */
  outputDir: string
  quality?: LiveQuality
  codec?: LiveCodec
  segmentSeconds?: number
  listSize?: number
}

/**
 * Synthesize a live-style HLS playlist using ffmpeg's built-in lavfi sources
 * (testsrc2 color bars + sine audio). The output mirrors what a real Mirakc
 * transcode would produce — MPEG-TS segments for AVC/HEVC, fMP4 for VP9 —
 * so hls.js treats both identically.
 */
export function buildDummyLiveArgs(opts: DummyLiveArgsOptions): string[] {
  const { outputDir, quality = 'auto', codec = 'avc', segmentSeconds = 2, listSize = 6 } = opts
  const { w, h, videoBitrate } = QUALITY_TO_RES[quality]

  // Synthetic video: color bars with timestamp overlay, 30fps.
  // Synthetic audio: 440Hz sine. Both loop forever (no duration).
  const input = [
    '-re', // real-time output — emits one second of media per second of wall clock
    '-f',
    'lavfi',
    '-i',
    `testsrc2=size=${w}x${h}:rate=30`,
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=440'
  ]

  // Keyframe every 2s so HLS can cut clean segments.
  const gop = ['-g', String(segmentSeconds * 30), '-keyint_min', String(segmentSeconds * 30)]

  const videoFlags =
    codec === 'hevc'
      ? ['-c:v', 'libx265', '-preset', 'ultrafast', '-x265-params', 'log-level=error', '-b:v', `${videoBitrate}k`]
      : codec === 'vp9'
        ? ['-c:v', 'libvpx-vp9', '-deadline', 'realtime', '-cpu-used', '4', '-b:v', `${videoBitrate}k`]
        : ['-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-b:v', `${videoBitrate}k`]

  // VP9 needs fMP4 segments (not allowed in MPEG-TS). AVC/HEVC use TS for
  // maximum hls.js / native compatibility.
  const audioCodec = codec === 'vp9' ? ['-c:a', 'libopus', '-b:a', '96k'] : ['-c:a', 'aac', '-b:a', '128k']

  const segmentExt = codec === 'vp9' ? 'm4s' : 'ts'
  const hlsFlags =
    codec === 'vp9'
      ? [
          '-f',
          'hls',
          '-hls_time',
          String(segmentSeconds),
          '-hls_list_size',
          String(listSize),
          '-hls_flags',
          'delete_segments+append_list+independent_segments',
          '-hls_segment_type',
          'fmp4',
          '-hls_fmp4_init_filename',
          'init.mp4',
          '-hls_segment_filename',
          `${outputDir}/%04d.${segmentExt}`,
          `${outputDir}/playlist.m3u8`
        ]
      : [
          '-f',
          'hls',
          '-hls_time',
          String(segmentSeconds),
          '-hls_list_size',
          String(listSize),
          '-hls_flags',
          'delete_segments+append_list+independent_segments',
          '-hls_segment_filename',
          `${outputDir}/%04d.${segmentExt}`,
          `${outputDir}/playlist.m3u8`
        ]

  return ['-y', ...input, ...gop, ...videoFlags, ...audioCodec, ...hlsFlags]
}
