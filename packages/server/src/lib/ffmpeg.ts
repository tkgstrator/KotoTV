// FFmpeg command builder — pure function, no side effects.
// All encoder tuning lives here; never inline flags in transcoder.ts.

export type HwAccel = 'none' | 'nvenc' | 'qsv' | 'vaapi'

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
    case 'qsv':
      return ['-hwaccel', 'qsv']
    case 'vaapi':
      // vaapi_device must be set before the input
      return ['-vaapi_device', '/dev/dri/renderD128']
    default:
      return []
  }
}

function buildVideoFlags(hwAccel: HwAccel, videoBitrate: number): string[] {
  switch (hwAccel) {
    case 'nvenc':
      return ['-c:v', 'h264_nvenc', '-preset', 'p4', '-b:v', `${videoBitrate}k`]
    case 'qsv':
      return ['-c:v', 'h264_qsv', '-preset', 'veryfast', '-b:v', `${videoBitrate}k`]
    case 'vaapi':
      return ['-vf', 'format=nv12,hwupload', '-c:v', 'h264_vaapi', '-b:v', `${videoBitrate}k`]
    default:
      return ['-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'zerolatency', '-b:v', `${videoBitrate}k`]
  }
}
