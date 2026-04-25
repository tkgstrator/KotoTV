import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parse as parseYaml } from 'yaml'
import { z } from 'zod'

const CONFIG_PATHS = [
  resolve(process.cwd(), 'config/kototv.yaml'),
  resolve(process.cwd(), '../config/kototv.yaml'),
  '/app/config/kototv.yaml'
]

const YamlSchema = z
  .object({
    server: z
      .object({
        port: z.number().optional()
      })
      .optional(),
    mirakc: z
      .object({
        url: z.string().optional()
      })
      .optional(),
    storage: z
      .object({
        recordings: z.string().optional(),
        encoded: z.string().optional(),
        hls: z.string().optional()
      })
      .optional(),
    streaming: z
      .object({
        hw_accel: z.enum(['nvenc', 'qsv', 'vaapi', 'none']).optional(),
        codec: z.enum(['avc', 'hevc']).optional(),
        vaapi_device: z.string().optional()
      })
      .optional(),
    hls: z
      .object({
        idle_kill_ms: z.number().optional(),
        access_timeout_ms: z.number().optional(),
        watchdog_interval_ms: z.number().optional()
      })
      .optional()
  })
  .optional()

function loadYamlConfig() {
  for (const p of CONFIG_PATHS) {
    if (existsSync(p)) {
      const raw = parseYaml(readFileSync(p, 'utf-8'))
      return YamlSchema.parse(raw)
    }
  }
  return undefined
}

const yaml = loadYamlConfig()

// Environment variables take precedence over YAML config.
// For each field: env var → yaml value → built-in default.
function pick<T>(envVal: string | undefined, yamlVal: T | undefined): string | T | undefined {
  if (envVal !== undefined && envVal !== '') return envVal
  return yamlVal
}

const merged = {
  NODE_ENV: Bun.env.NODE_ENV,
  PORT: pick(Bun.env.PORT, yaml?.server?.port?.toString()),
  DATABASE_URL: Bun.env.DATABASE_URL,
  MIRAKC_URL: pick(Bun.env.MIRAKC_URL, yaml?.mirakc?.url),
  HW_ACCEL_TYPE: pick(Bun.env.HW_ACCEL_TYPE, yaml?.streaming?.hw_accel),
  HLS_DIR: pick(Bun.env.HLS_DIR, yaml?.storage?.hls),
  HLS_IDLE_KILL_MS: pick(Bun.env.HLS_IDLE_KILL_MS, yaml?.hls?.idle_kill_ms?.toString()),
  HLS_ACCESS_TIMEOUT_MS: pick(Bun.env.HLS_ACCESS_TIMEOUT_MS, yaml?.hls?.access_timeout_ms?.toString()),
  HLS_WATCHDOG_INTERVAL_MS: pick(Bun.env.HLS_WATCHDOG_INTERVAL_MS, yaml?.hls?.watchdog_interval_ms?.toString()),
  MIRAKC_MOCK_STREAM: Bun.env.MIRAKC_MOCK_STREAM,
  VAAPI_DEVICE: pick(Bun.env.VAAPI_DEVICE, yaml?.streaming?.vaapi_device),
  RECORDINGS_DIR: pick(Bun.env.RECORDINGS_DIR, yaml?.storage?.recordings),
  ENCODED_DIR: pick(Bun.env.ENCODED_DIR, yaml?.storage?.encoded),
  CODEC: pick(Bun.env.CODEC, yaml?.streaming?.codec),
  BUILD_VERSION: Bun.env.BUILD_VERSION
}

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(11575),
  DATABASE_URL: z.string().url(),
  MIRAKC_URL: z.string().url().default('http://mirakc:40772'),
  HW_ACCEL_TYPE: z.enum(['nvenc', 'qsv', 'vaapi', 'none']).default('none'),
  HLS_DIR: z.string().default('./data/hls'),
  HLS_IDLE_KILL_MS: z.coerce.number().int().positive().default(15_000),
  HLS_ACCESS_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  HLS_WATCHDOG_INTERVAL_MS: z.coerce.number().int().positive().default(10_000),
  MIRAKC_MOCK_STREAM: z.coerce.boolean().default(false),
  VAAPI_DEVICE: z.string().startsWith('/dev/dri/').default('/dev/dri/renderD128'),
  RECORDINGS_DIR: z.string().default('./data/recordings'),
  ENCODED_DIR: z.string().default('./data/encoded'),
  CODEC: z.enum(['avc', 'hevc']).default('avc'),
  BUILD_VERSION: z.string().optional()
})

const result = EnvSchema.safeParse(merged)

if (!result.success) {
  const issues = result.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n')
  throw new Error(`Configuration is invalid:\n${issues}`)
}

export const env = result.data
