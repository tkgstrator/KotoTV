import { z } from 'zod'

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(11575),
  DATABASE_URL: z.string().url(),
  MIRAKC_URL: z.string().url().default('http://mirakc:40772'),
  HW_ACCEL_TYPE: z.enum(['nvenc', 'qsv', 'vaapi', 'none']).default('none'),
  /* Workspace-relative. Prod mounts this path as tmpfs via compose. */
  HLS_DIR: z.string().default('./data/hls'),
  /* Milliseconds of zero-viewer idle time before the FFmpeg process is killed. */
  HLS_IDLE_KILL_MS: z.coerce.number().int().positive().default(15_000),
  /* Absolute watchdog: kill a session if no playlist/segment GET has arrived
   * within this window, regardless of viewerCount. Protects against orphaned
   * sessions when the client DELETE never reaches the server (tab crash,
   * network drop, HMR race). */
  HLS_ACCESS_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  /* Scan interval for the access watchdog. */
  HLS_WATCHDOG_INTERVAL_MS: z.coerce.number().int().positive().default(10_000),
  /* When truthy, openLiveStream returns a synthetic testsrc2 MPEG-TS instead of
   * hitting Mirakc. Used by Playwright E2E in envs without an antenna signal. */
  MIRAKC_MOCK_STREAM: z.coerce.boolean().default(false),
  /* VAAPI render-node device path. Override when the kernel assigns a node
   * number other than renderD128 (e.g. renderD129 on multi-GPU hosts). */
  VAAPI_DEVICE: z.string().startsWith('/dev/dri/').default('/dev/dri/renderD128'),
  RECORDINGS_DIR: z.string().default('./data/recordings')
})

const result = EnvSchema.safeParse(Bun.env)

if (!result.success) {
  const issues = result.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n')
  throw new Error(`Environment configuration is invalid:\n${issues}`)
}

export const env = result.data
