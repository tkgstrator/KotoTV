# Encode Profile — Resolution picker + save-time benchmark

**Phase:** 4 (録画) follow-up — extends existing `EncodeProfile` flow · **Date:** 2026-04-20 · **Owner:** leader

## Decisions log (2026-04-20)

All six open questions resolved by the leader. Summary:

1. **Recording-only fields.** `keepOriginalResolution` / `resolution` never reach the live path. Guards added in FFmpeg section.
2. **QSV scale syntax.** Use `scale_qsv=w=W:h=H` (FFmpeg 6.x `key=value` form). `devops` verifies against the container image's FFmpeg build once QSV hardware is available.
3. **Benchmark source resolution.** Always `testsrc2=1920x1080@30` regardless of target — matches Japanese broadcast worst case.
4. **Rate-control flag translation.** Fix `buildVideoFlags` in this PR so `rateControl` + `bitrateKbps` + `qpValue` translate to concrete flags for both recording and benchmark paths.
5. **Realtime threshold.** `MIN_REALTIME_FPS = 30000 / 1001` (29.97). Client copy updated accordingly.
6. **Benchmark persistence.** New `BenchmarkLog` table (option B), written on every run, pruned to the last 100 rows. New `GET /benchmark/history` route + settings-tab history section.

## Goal

Give the encode-profile settings dialog a "原寸維持 / 解像度指定" toggle plus a 1080p/720p/480p picker, and verify that the chosen (codec × hwAccel × rateControl × bitrate/qp × resolution) combo can actually encode faster-than-realtime on this host before the profile is persisted. The benchmark runs server-side via FFmpeg against a `testsrc2` synthetic input, returns `{ ok, fps, wallSeconds }`, and the client either saves silently (pass) or asks the user to confirm a likely-unusable profile (fail).

One coherent feature = one branch, one PR. Commits may be phased (schema/dto → ffmpeg → benchmark service → client wiring → tests) but they ship together.

## Non-goals

- No resolution selection for live streams — live stays bound to `QualityChoice` / `QUALITY_PRESETS` from `packages/server/src/lib/ffmpeg.ts`. This feature only affects offline recordings via `EncodeProfile`.
- No benchmark for live `acquireLive` sessions. The user can't afford a 5 s delay before tuning; benchmarks only run on explicit profile save.
- No background re-bench when hardware changes, no scheduled validation. Benchmark only runs on explicit profile save. (Results ARE persisted to `BenchmarkLog` per Decisions #6 — but the run itself is user-triggered, not automatic.)
- No hardware capability enumeration (e.g. "does this GPU support HEVC?") — benchmark simply attempts the exact command the transcoder would run and reports failure if FFmpeg exits non-zero.
- No audio encoder benchmark — `-an` is fine; video-only keeps the probe honest and short.
- No concurrent benchmarking. Single-flight server-wide.

## Approach

1. **Schema** — add two columns to `encode_profiles`: `keep_original_resolution BOOLEAN DEFAULT true` and `resolution Resolution DEFAULT 'hd720'`. `Resolution` is a new Prisma enum with values `hd1080 | hd720 | sd480`. Enum (not `width`+`height` pair) because:
   - The set is closed — no 1440p/4K planned, and custom sizes open a UX rabbit hole for little value.
   - We need to render a three-button `ToggleGroup` on the client and pattern-match on the server; enum gives us exhaustive `switch` checks in both places.
   - Width/height is still derivable via a small `RESOLUTION_DIMENSIONS` record in `ffmpeg.ts`, keeping the domain logic pure.
   - `keep_original_resolution` defaults ON because the new toggle's spec says "Default ON", and ON means the existing FFmpeg behavior (no scale filter added for the recording path) — so older profiles behave identically after migration without re-saving.
2. **FFmpeg** — insert a single `scaleFlags` segment into `buildFfmpegArgs` that picks the right filter per `hwAccel`. For VAAPI the existing `-vf format=nv12,hwupload` chain becomes `format=nv12,hwupload,scale_vaapi=w=W:h=H`; NVEnc gets a `-vf scale_cuda=W:H` (NVEnc path currently has no `-vf`); CPU gets `-vf scale=W:H`. When `keepOriginalResolution=true`, no scale filter is emitted and the existing `-s WxH` flag is also dropped — important, because `-s` is what currently hardcodes the size in the HLS path and we need both sides of the filter graph to match the source.
3. **Benchmark endpoint** — new `POST /api/encode-profiles/benchmark`. Body is the same shape as `CreateEncodeProfileSchema` plus the two new fields. Server resolves the draft into an FFmpeg arg list (via a new `buildBenchmarkArgs` variant of the existing builder — same codec/hwAccel/rateControl logic, but input is `-f lavfi -i testsrc2=...` and output is `-f null -`), spawns it with `Bun.spawn`, captures stderr to extract `fps=`, times wall-clock via `performance.now()`, enforces a 30 s hard cap via `AbortController`. Concurrency is a module-level `Promise | null` — if a bench is already running, the second caller gets `HTTP 409 benchmark_busy`.
4. **Client** — the `ProfileDialog` gets two new form controls (toggle + three-way picker) wired into `ProfileDraft`. The Save button no longer calls `createMutation.mutateAsync` directly; it calls a new `useBenchmarkEncodeProfile` mutation first. On `ok=true` it proceeds to save. On `ok=false` it surfaces an `AlertDialog` — "ベンチマークが 30fps を下回りました (12 fps / 7.3 s)。このまま保存しますか？" — with `このまま保存` (destructive variant) + `キャンセル`. On spawn failure (`exitCode !== 0`) we treat it as `ok=false` with `reason=<stderr tail>`.
5. **Trade-offs**:
   - Enum over (w,h) pair: cheaper server UX but rigid. If we later need 1440p we add one enum value + one migration. Accepted.
   - Benchmark input = `testsrc2` not a real Mirakc sample: doesn't exercise the MPEG-TS demuxer, but correctly exercises the scale-filter / encoder / rate-control path which is the bottleneck on consumer hw. Cheaper and deterministic.
   - 5 s duration chosen because 30 fps × 5 s = 150 frames — enough for NVEnc/QSV warmup and for libx264 rate-control to settle, short enough to feel snappy in a dialog.
   - Server-wide single-flight (not per-profile) to avoid a user spamming save and starving real recordings of GPU bandwidth.

## Schema changes

### Prisma diff (`packages/server/prisma/schema.prisma`)

```prisma
enum Resolution {
  hd1080   // 1920x1080
  hd720    // 1280x720
  sd480    // 854x480
}

model EncodeProfile {
  // ...existing fields...
  keepOriginalResolution Boolean    @default(true) @map("keep_original_resolution")
  resolution             Resolution @default(hd720)
  // ...
}

model BenchmarkLog {
  id                     String          @id @default(uuid())
  createdAt              DateTime        @default(now()) @map("created_at")
  codec                  RuleEncodeCodec
  hwAccel                HwAccelType     @map("hw_accel")
  rateControl            RateControl     @map("rate_control")
  bitrateKbps            Int             @map("bitrate_kbps")
  qpValue                Int             @map("qp_value")
  keepOriginalResolution Boolean         @map("keep_original_resolution")
  resolution             Resolution
  ok                     Boolean
  fps                    Float
  wallSeconds            Float           @map("wall_seconds")
  reason                 String?         // truncated to 2000 chars by the service before insert

  @@index([createdAt])
  @@map("benchmark_logs")
}
```

`BenchmarkLog` reuses the existing `RuleEncodeCodec` / `HwAccelType` / `RateControl` enums so it stays in lockstep with the profile model. `reason` is nullable because successful runs have no failure reason; on failure the service truncates to 2000 chars so stderr tails don't blow up the table.

### Migration

Single migration covers both the `encode_profiles` column additions and the new `benchmark_logs` table — this is one feature branch so we ship one migration, not two.

- Name: `20260421XXXXXX_add_resolution_and_benchmark_log`
- Generation: `bunx prisma migrate dev --name add_resolution_and_benchmark_log`
- SQL shape (auto-generated; for review):

```sql
CREATE TYPE "Resolution" AS ENUM ('hd1080', 'hd720', 'sd480');

ALTER TABLE "encode_profiles"
  ADD COLUMN "keep_original_resolution" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "resolution" "Resolution" NOT NULL DEFAULT 'hd720';

CREATE TABLE "benchmark_logs" (
  "id"                       TEXT             NOT NULL,
  "created_at"               TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "codec"                    "RuleEncodeCodec" NOT NULL,
  "hw_accel"                 "HwAccelType"    NOT NULL,
  "rate_control"             "RateControl"    NOT NULL,
  "bitrate_kbps"             INTEGER          NOT NULL,
  "qp_value"                 INTEGER          NOT NULL,
  "keep_original_resolution" BOOLEAN          NOT NULL,
  "resolution"               "Resolution"     NOT NULL,
  "ok"                       BOOLEAN          NOT NULL,
  "fps"                      DOUBLE PRECISION NOT NULL,
  "wall_seconds"             DOUBLE PRECISION NOT NULL,
  "reason"                   TEXT,
  CONSTRAINT "benchmark_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "benchmark_logs_created_at_idx" ON "benchmark_logs" ("created_at");
```

Existing `encode_profiles` rows inherit `keep_original_resolution=true`, so their transcode output is byte-identical to pre-migration. `resolution=hd720` is harmless because it's only consulted when `keep_original_resolution=false`. `benchmark_logs` starts empty; retention is handled in application code (see Benchmark service).

## DTO / API changes

### `packages/server/src/schemas/EncodeProfile.dto.ts`

Add:

```ts
export const ResolutionSchema = z.enum(['hd1080', 'hd720', 'sd480'])
export type Resolution = z.infer<typeof ResolutionSchema>
```

Extend `EncodeProfileSchema` and `CreateEncodeProfileSchema`:

```ts
keepOriginalResolution: z.boolean(),
resolution: ResolutionSchema
```

(with `.default(true)` and `.default('hd720')` in `CreateEncodeProfileSchema`).

New benchmark IO:

```ts
export const BenchmarkRequestSchema = CreateEncodeProfileSchema   // reuse shape
  .omit({ name: true, isDefault: true })                          // irrelevant to probe
export const BenchmarkResponseSchema = z.object({
  ok: z.boolean(),
  fps: z.number(),
  wallSeconds: z.number(),
  reason: z.string().optional()
})

// Persisted history row (serialized form of the Prisma BenchmarkLog model).
export const BenchmarkLogSchema = z.object({
  id:                     z.string().uuid(),
  createdAt:              z.string(),                    // ISO-8601
  codec:                  RuleEncodeCodecSchema,
  hwAccel:                HwAccelTypeSchema,
  rateControl:            RateControlSchema,
  bitrateKbps:            z.number().int(),
  qpValue:                z.number().int(),
  keepOriginalResolution: z.boolean(),
  resolution:             ResolutionSchema,
  ok:                     z.boolean(),
  fps:                    z.number(),
  wallSeconds:            z.number(),
  reason:                 z.string().nullable()
})
export const BenchmarkHistoryResponseSchema = z.object({
  items: z.array(BenchmarkLogSchema)                     // at most 100, sorted createdAt DESC
})
```

### `packages/server/src/routes/encode-profiles.ts`

- `POST /` and `PATCH /:id`: pass `keepOriginalResolution` + `resolution` straight through `prisma.encodeProfile.create/update` and include them in `serialize()`.
- **New** `POST /benchmark` with `zValidator('json', BenchmarkRequestSchema)` → delegates to `benchmarkProfile(body)` from the new service, returns `BenchmarkResponseSchema`. The service also writes a `BenchmarkLog` row (see Benchmark service) before returning.
- **New** `GET /benchmark/history` → returns `BenchmarkHistoryResponseSchema`. Implementation: `prisma.benchmarkLog.findMany({ orderBy: { createdAt: 'desc' }, take: 100 })`, mapped through a small `serializeBenchmarkLog()` that ISO-stringifies `createdAt`.
- Wire the route in `packages/server/src/app.ts` (already mounted — no change needed; just new sub-paths).

### `packages/client/src/types/EncodeProfile.ts`

Add:

```ts
export type Resolution = 'hd1080' | 'hd720' | 'sd480'
export interface EncodeProfile {
  // ...existing...
  keepOriginalResolution: boolean
  resolution: Resolution
}
```

### `packages/client/src/hooks/useEncodeProfiles.ts`

New mutation:

```ts
export function useBenchmarkEncodeProfile() {
  return useMutation<BenchmarkResponse, Error, BenchmarkRequest>({
    mutationKey: ['encode-profiles', 'benchmark'],
    mutationFn: async (body) => {
      const res = await fetch('/api/encode-profiles/benchmark', { ... })
      if (res.status === 409) throw new Error('他のプロファイルを検証中です。少し待って再試行してください')
      // ...
    },
    onSuccess: () => {
      // One completed run just added a history row. Narrow-invalidate.
      queryClient.invalidateQueries({ queryKey: ['encode-profiles', 'benchmark', 'history'] })
    }
  })
}
```

Because each benchmark writes a `BenchmarkLog` row, the mutation *does* invalidate the history query (but not `useEncodeProfiles`, which is independent).

New query:

```ts
export function useBenchmarkHistory() {
  return useQuery<BenchmarkHistoryResponse>({
    queryKey: ['encode-profiles', 'benchmark', 'history'],
    queryFn: () => fetch('/api/encode-profiles/benchmark/history').then(r => r.json()),
    staleTime: 10_000
  })
}
```

## FFmpeg changes

All inside `packages/server/src/lib/ffmpeg.ts`.

> **Live-path guard (Decisions #1).** `keepOriginalResolution` and `resolution` are **recording-only**. They must never be referenced by `packages/server/src/services/stream-manager.ts` or the live branches of `packages/server/src/services/transcoder.ts`. `buildFfmpegArgs` carries an explicit top-of-function comment stating this, and the live tests assert the flag set built for a `QualityChoice` call contains no `scale_*` filter. Any future refactor that passes an `EncodeProfile` into the live path must strip these two fields first.

### New exports

```ts
export type Resolution = 'hd1080' | 'hd720' | 'sd480'
export const RESOLUTION_DIMENSIONS: Record<Resolution, { width: number; height: number }> = {
  hd1080: { width: 1920, height: 1080 },
  hd720:  { width: 1280, height:  720 },
  sd480:  { width:  854, height:  480 }
}
```

### `FfmpegArgsOptions` additions

Extend the type (line 27) with:

```ts
keepOriginalResolution?: boolean       // default true — no scaling
resolution?: Resolution                // only consulted when !keepOriginalResolution
```

When `keepOriginalResolution` is true, suppress the `-s WxH` flag entirely (current `scaleFlags` around `ffmpeg.ts:79–90` hardcodes it via the quality preset). When false, emit `-s` at the target resolution **and** ensure the scale filter goes into the right `-vf`.

### `buildVideoFlags` (`ffmpeg.ts:146–184`) — insert scale filter per HwAccel

Add a helper `resolveScaleFilter(hwAccel, keep, resolution): string[]`:

- `keep === true` → `[]` (no -vf)
- `hwAccel === 'vaapi'` → current `-vf format=nv12,hwupload` becomes `-vf format=nv12,hwupload,scale_vaapi=w=W:h=H` (concatenated filter chain, NOT two `-vf` flags — FFmpeg keeps only the last)
- `hwAccel === 'nvenc'` → `-vf scale_cuda=W:H` (NVEnc currently emits no `-vf`; add one)
- `hwAccel === 'qsv'` → `-vf scale_qsv=w=W:h=H`
- `hwAccel === 'none'` → `-vf scale=W:H:flags=bicubic`

Exact insertion points:

- VAAPI case (current `ffmpeg.ts:159–162`): replace the literal `'format=nv12,hwupload'` with the composed chain.
- NVEnc case (`ffmpeg.ts:150–153`): prepend `...(keep ? [] : ['-vf', 'scale_cuda=W:H'])` before `-c:v`.
- QSV case (`ffmpeg.ts:154–157`): same pattern as NVEnc with `scale_qsv`.
- CPU case (`ffmpeg.ts:163–183`): prepend `...(keep ? [] : ['-vf', 'scale=W:H:flags=bicubic'])` before `-c:v`.

### `buildBenchmarkArgs` — new exported function

Sibling to `buildFfmpegArgs`, reusing the same `buildHwPreInput` / `buildVideoFlags`:

```ts
export type BenchmarkArgsOptions = {
  hwAccel: HwAccel
  codec: Codec
  rateControl: RateControl         // 'cbr' | 'vbr' | 'cqp'
  bitrateKbps: number
  qpValue: number
  keepOriginalResolution: boolean
  resolution: Resolution
  durationSec?: number             // default 5
}

export function buildBenchmarkArgs(opts: BenchmarkArgsOptions): string[]
```

Output:

```
ffmpeg -y -f lavfi -i testsrc2=duration=5:size=1920x1080:rate=30
       [hwPreInput]
       -c:v <encoder> [-preset …] [scale filter]
       [-b:v Nk -minrate:v Nk -maxrate:v Nk -bufsize (2N)k]   # cbr
       [-b:v Nk -maxrate:v (1.5N)k -bufsize (2N)k]            # vbr
       [-qp Q  /  -cq Q  /  -global_quality Q]                # cqp, encoder-dependent
       -an
       -f null -
```

- `testsrc2` size is **always** `1920x1080@30` regardless of target resolution (Decisions #3). Rationale: Japanese broadcast originals are 1080i / 1080p, so this matches the worst-case real pipeline. Even when `keepOriginalResolution=true`, the source stays 1080p so the encoder sees the same pixel count it would during a real recording. Add a code comment referencing this plan.
- Rate-control branch: see the rate-control flag matrix below. `buildBenchmarkArgs` and `buildVideoFlags` share the same helper (`buildRateControlFlags`), so drift between benchmark and recording paths is impossible by construction.
- `-an` so we don't need `anullsrc`.

### Rate-control flag matrix (Decisions #4)

`buildVideoFlags` currently only emits `-b:v` and ignores `rateControl` / `qpValue`. This PR fixes that for both the recording pipeline and the benchmark. New helper `buildRateControlFlags(hwAccel, rateControl, bitrateKbps, qpValue)` returns the flag list below; the output is identical whether called from `buildFfmpegArgs` or `buildBenchmarkArgs`.

Let `N = bitrateKbps`, `Q = qpValue`.

| rateControl | libx264 (`hwAccel='cpu'`) | NVEnc (`nvenc`) | QSV (`qsv`) | VAAPI (`vaapi`) |
|-------------|---------------------------|-----------------|-------------|-----------------|
| `vbr` (current default) | `-b:v Nk -maxrate:v (1.5N)k -bufsize (2N)k` | same | same | same |
| `cbr` | `-b:v Nk -minrate:v Nk -maxrate:v Nk -bufsize (2N)k` | same | same | same |
| `cqp` | `-qp Q` | `-cq Q` | `-global_quality Q` | `-qp Q` |

- `(1.5N)` and `(2N)` are integer-rounded (`Math.round`), emitted as `…k` strings.
- For `cqp` the encoder-specific flag names diverge — `nvenc` uses `-cq`, `qsv` uses `-global_quality`. VAAPI accepts `-qp` in practice; if the VAAPI test fails in CI we fall back to `-global_quality` and add a note. A dedicated test case per encoder pins each flag name.
- When `rateControl='cqp'`, do NOT emit `-b:v`. The three bitrate-based flags are mutually exclusive with the quantizer flag.
- The `vbr` row documents today's behavior explicitly so the test can assert it doesn't regress.

### Recording-path call-site

`buildVideoFlags` (`ffmpeg.ts:146–184`) swaps its current literal `-b:v Nk` for `...buildRateControlFlags(hwAccel, rateControl, bitrateKbps, qpValue)`. All four hwAccel branches change; the existing `-preset`, codec, and pixel-format flags are untouched.

## Benchmark service

### New file: `packages/server/src/services/encode-benchmark.ts`

```ts
import { buildBenchmarkArgs } from '../lib/ffmpeg'
import { logger } from '../lib/logger'
import { prisma } from '../lib/prisma'

export type BenchmarkResult = {
  ok: boolean
  fps: number
  wallSeconds: number
  reason?: string
}

const BENCH_TIMEOUT_MS = 30_000
// Decisions #5 — Japanese broadcast is 29.97 / 59.94 fps, so the realtime bar is 30000/1001.
export const MIN_REALTIME_FPS = 30_000 / 1001   // 29.97002997...
const HISTORY_KEEP = 100
const REASON_MAX_CHARS = 2000

let running: Promise<BenchmarkResult> | null = null

export function isBenchmarkBusy(): boolean { return running !== null }

export async function benchmarkProfile(opts: BenchmarkArgsOptions): Promise<BenchmarkResult> {
  if (running) throw new Error('benchmark_busy')
  running = runOnce(opts).finally(() => { running = null })
  return running
}
```

`runOnce` mirrors the `startTranscoder` lifecycle (`packages/server/src/services/transcoder.ts:55–216`):

- `Bun.spawn(['ffmpeg', ...buildBenchmarkArgs(opts)], { stdin: 'ignore', stdout: 'ignore', stderr: 'pipe' })`
- Parse stderr line-by-line with a tiny variant of `pipeStderrToLogger` (reuse the decode loop; don't export the private one — copy it or extract to `lib/ffmpeg-stderr.ts` if we want to share).
- Track latest `fps=X.Y` via the same `STATS_RE` used in `transcoder.ts:46`; no need for bitrate/drop.
- `AbortController.signal` → on timeout, `proc.kill('SIGTERM')` then `proc.kill('SIGKILL')` after 1 s; return `{ ok: false, reason: 'timeout' }`.
- On natural exit:
  - `exitCode !== 0` → `{ ok: false, fps: last ?? 0, wallSeconds, reason: stderr.tail(20 lines) }`
  - `exitCode === 0 && lastFps >= MIN_REALTIME_FPS` → `{ ok: true, fps, wallSeconds }`
  - `exitCode === 0 && lastFps  < MIN_REALTIME_FPS` → `{ ok: false, fps, wallSeconds, reason: 'below_realtime' }`
- Timer: `const t0 = performance.now()`; `wallSeconds = (performance.now() - t0) / 1000`.

### Persistence (Decisions #6)

After `runOnce` computes the `BenchmarkResult`, and **before** resolving the outer promise, the service writes a `BenchmarkLog` row and prunes old rows. Written for every invocation — success *and* failure — so the UI history shows the user their last 100 attempts.

```ts
await prisma.$transaction(async (tx) => {
  await tx.benchmarkLog.create({
    data: {
      codec:                  opts.codec,
      hwAccel:                opts.hwAccel,
      rateControl:            opts.rateControl,
      bitrateKbps:            opts.bitrateKbps,
      qpValue:                opts.qpValue,
      keepOriginalResolution: opts.keepOriginalResolution,
      resolution:             opts.resolution,
      ok:                     result.ok,
      fps:                    result.fps,
      wallSeconds:            result.wallSeconds,
      reason:                 result.reason?.slice(0, REASON_MAX_CHARS) ?? null
    }
  })
  // Keep only the newest HISTORY_KEEP rows.
  await tx.$executeRaw`
    DELETE FROM "benchmark_logs"
     WHERE "id" NOT IN (
       SELECT "id" FROM "benchmark_logs"
        ORDER BY "created_at" DESC
        LIMIT ${HISTORY_KEEP}
     )
  `
})
```

- **Retention strategy:** last-100 rows (not time-based). Simpler than a 30-day cron: the prune runs inline with every insert, so the table can never exceed 101 rows between steps. No separate scheduler needed.
- **Atomicity:** insert + prune are wrapped in a single `prisma.$transaction`. If the prune fails for any reason, the insert is rolled back — the table cannot grow unboundedly even if the `DELETE` encounters a transient error.
- **Also keep pino logging.** The service still emits `logger.info({ result, opts }, 'encode benchmark done')` regardless of DB outcome, so `docker logs` retains a parallel audit trail for debugging.
- **Failure mode isolation:** a DB error during persistence is logged via `logger.warn` but does NOT fail the benchmark response — the user still gets their `{ ok, fps, wallSeconds }` back. Benchmark is a probe; it's not blocked on the logbook.

### Concurrency

The module-level `running: Promise<BenchmarkResult> | null` gate is the single-flight mutex. Pattern matches the existing `pending` map in `stream-manager.ts:53`, but degenerate (one slot). Rationale: benchmarking pins one encoder slot (GPU queue, CPU cores); running two simultaneously skews both. `POST /benchmark` translates `throw 'benchmark_busy'` into `HTTP 409 { error: { message: 'benchmark_busy' } }`.

### Integration points

- No SSE. One DB write per run (the `BenchmarkLog` insert + prune) — wrapped in a transaction, failure-isolated from the HTTP response.
- `env.HW_ACCEL_TYPE` is **not** used. Benchmark must honor the `hwAccel` field from the request so the user can preview a GPU-bound profile on their CPU-only dev box (and see it fail).

## Client changes

### `packages/client/src/routes/settings.tsx` — `ProfileDialog`

1. Extend `ProfileDraft` (`settings.tsx:474–485`) with `keepOriginalResolution: boolean` + `resolution: Resolution`. Seed `EMPTY_DRAFT` (`settings.tsx:487–498`) with `true` / `'hd720'`. Update `toDraft` (`settings.tsx:500–513`).
2. Add a new form row under the existing "プリセット" grid, before タイミング:

```
┌─ 解像度 ─────────────────────────────────────┐
│ [ Switch ] オリジナルの解像度を維持           │
│   ↓ (only when OFF)                            │
│ ToggleGroup: [1080p] [720p] [480p]             │
└─────────────────────────────────────────────┘
```

Use the same `TOGGLE_ON_CLS` styling (`settings.tsx:471–472`) and `ToggleGroup type='single'` pattern already in the dialog for codec/quality.

3. Replace the `onSubmit` path. Current (`settings.tsx:712`): `onClick={() => onSubmit(draft)}`. New flow:

```ts
const benchmark = useBenchmarkEncodeProfile()
const [pendingBenchResult, setPendingBenchResult] = useState<BenchmarkResult | null>(null)

async function handleSave() {
  try {
    const res = await benchmark.mutateAsync(extractBenchmarkFields(draft))
    if (res.ok) {
      onSubmit(draft)
    } else {
      setPendingBenchResult(res)   // opens AlertDialog
    }
  } catch (err) {
    // 409 or network — just try to save with a warning toast
    toast.warning('ベンチマークに失敗しました。結果を確認せず保存しますか?')
    setPendingBenchResult({ ok: false, fps: 0, wallSeconds: 0, reason: err.message })
  }
}
```

4. Button label state:
   - idle: 作成 / 更新 (uses `submitLabel` prop)
   - `benchmark.isPending`: 検証中…
   - `createMutation.isPending` (after bench pass): 保存中…

5. Confirm `AlertDialog` when `pendingBenchResult && !pendingBenchResult.ok`:

```
Title:  ベンチマークが基準を満たしませんでした
Body:   平均 {fps} fps / 処理時間 {wallSeconds.toFixed(1)} 秒
        リアルタイム再生 (29.97 fps) を下回っています。
        このまま保存すると、録画キューが詰まる可能性があります。
        {reason && <pre>{reason}</pre>}
Cancel: キャンセル
Action: このまま保存  (variant='destructive')
```

Confirming triggers `onSubmit(draft)` exactly as before; cancel dismisses the AlertDialog and keeps the ProfileDialog open.

### `packages/client/src/hooks/useEncodeProfiles.ts`

Add both `useBenchmarkEncodeProfile` and `useBenchmarkHistory` as described in the DTO section.

- `useBenchmarkEncodeProfile` — `mutationKey: ['encode-profiles', 'benchmark']`. On success, narrow-invalidates `['encode-profiles', 'benchmark', 'history']` so the new row appears in the history table without a manual refresh.
- `useBenchmarkHistory` — `queryKey: ['encode-profiles', 'benchmark', 'history']`, `staleTime: 10_000`. Used only by the history section in the encode tab.

### ベンチマーク履歴 section (Decisions #6)

New section in `packages/client/src/routes/settings.tsx`, rendered **under** the existing プロファイル一覧 inside the エンコード tab. Collapsible `<details>` by default so it doesn't dominate the tab; the last-100 cap means the table height is bounded.

Columns (left to right):

| 実行時刻 | コーデック | HW | 解像度 | レート | fps | 結果 |
|----------|-----------|----|--------|--------|-----|------|

- 実行時刻: `format(toDate(row.createdAt), 'MM/dd HH:mm', { locale: ja })` via date-fns (per memory rule — never `new Date()`).
- コーデック: `row.codec.toUpperCase()` (AVC / HEVC / VP9).
- HW: label-map (`cpu → CPU`, `nvenc → NVEnc`, `vaapi → VAAPI`).
- 解像度: `keepOriginalResolution ? '原寸' : { hd1080: '1080p', hd720: '720p', sd480: '480p' }[row.resolution]`.
- レート: `rateControl === 'cqp' ? \`QP=\${qpValue}\` : \`\${bitrateKbps}kbps (\${rateControl.toUpperCase()})\``.
- fps: `row.fps.toFixed(1)`. Cell turns text-destructive when `!row.ok`.
- 結果:
  - `ok=true` → `<CheckIcon>` in the `text-success` token (or `text-primary` if no success token is configured — confirm with designer).
  - `ok=false` → `<XIcon>` in `text-destructive`, with the `reason` shown in a `<Tooltip>` on hover. Truncate tooltip to 500 chars for readability (the DB has up to 2000).

Empty state: "まだベンチマーク履歴はありません — プロファイルを保存すると記録されます。"

### No changes to

- `useEncodeProfiles` query (server serializes the new fields; existing `EncodeProfile` type just grows two fields).
- Rule/reservation pickers (they read `profile.codec/quality/timing/hwAccel` only).
- Live stream selection — resolution field is ignored by `streamManager.acquireLive`.

## Tests

### `packages/server/src/lib/ffmpeg.test.ts` — add cases

Scale-filter cases:

- `keepOriginalResolution: true` across all four hwAccels → no `-vf scale*`, no `-s`.
- `keep=false, resolution='hd720', hwAccel='none'` → `-vf scale=1280:720:flags=bicubic`.
- `keep=false, resolution='hd1080', hwAccel='nvenc'` → `-vf scale_cuda=1920:1080` appears before `-c:v h264_nvenc`.
- `keep=false, resolution='sd480', hwAccel='vaapi'` → `-vf` value equals `format=nv12,hwupload,scale_vaapi=w=854:h=480` (single concatenated chain — most likely to regress).
- `keep=false, resolution='hd720', hwAccel='qsv'` → `-vf scale_qsv=w=1280:h=720`.
- Ordering invariant: when `keep=false` the new `-vf` appears **after** `hwPreInput`, **before** `-c:v`.

Rate-control flag cases (one per cell of the matrix in FFmpeg changes):

- `rateControl='vbr'`, all four hwAccels, `bitrateKbps=4000` → flags contain `-b:v 4000k`, `-maxrate:v 6000k`, `-bufsize 8000k`; no `-minrate:v`.
- `rateControl='cbr'`, all four hwAccels, `bitrateKbps=4000` → flags contain `-b:v 4000k`, `-minrate:v 4000k`, `-maxrate:v 4000k`, `-bufsize 8000k`.
- `rateControl='cqp', qpValue=22, hwAccel='cpu'` → flags contain `-qp 22`; flags do NOT contain `-b:v`.
- `rateControl='cqp', qpValue=22, hwAccel='nvenc'` → flags contain `-cq 22`; flags do NOT contain `-b:v`.
- `rateControl='cqp', qpValue=22, hwAccel='qsv'` → flags contain `-global_quality 22`; flags do NOT contain `-b:v`.
- `rateControl='cqp', qpValue=22, hwAccel='vaapi'` → flags contain `-qp 22` (or `-global_quality 22` if we flipped during impl — the test pins the decision).
- Benchmark-vs-recording parity: for a fixed `{codec, hwAccel, rateControl, bitrateKbps, qpValue}`, `buildBenchmarkArgs(opts)` and `buildFfmpegArgs({...opts, keepOriginalResolution:true})` produce the **same** tail of rate-control flags. Regression guard against the drift risk.

### New file `packages/server/src/services/encode-benchmark.test.ts`

Process-lifecycle cases:

- Mock `Bun.spawn` by stubbing `globalThis.Bun.spawn` to return a fake proc with a controllable stderr ReadableStream + `exited` promise. Return fake stderr lines containing `fps=45.3` → assert `{ ok: true, fps: 45 }`.
- Spawn stub emits `fps=12.0` → `{ ok: false, reason: 'below_realtime', fps: 12 }`.
- Spawn stub emits `fps=29.5` → `{ ok: false, reason: 'below_realtime' }` (just below the 29.97 threshold — pins Decisions #5).
- Spawn stub emits `fps=30.0` → `{ ok: true }` (just above).
- Spawn stub resolves `exited = 1` with stderr "Unknown encoder" → `{ ok: false, reason matches /Unknown encoder/ }`.
- Second concurrent call while first is pending → rejects with `Error('benchmark_busy')`.
- Long-running (never exits) → AbortController fires after `BENCH_TIMEOUT_MS` → `{ ok: false, reason: 'timeout' }`. For the test, override the timeout to 200 ms.

Persistence + prune cases (Decisions #6):

- After a successful run, exactly one new `BenchmarkLog` row exists with `ok=true` and matching `codec`/`hwAccel`/`resolution` columns.
- After a failed run (stderr error), a row with `ok=false` and `reason` set is also persisted — failure does NOT skip logging.
- Reason truncation: a run that produces a 5000-char stderr tail stores a `reason` column of length exactly 2000.
- Prune bound: seed the DB with 105 existing rows, run one benchmark → `benchmarkLog.count()` returns 100; the newest row (the one just inserted) is present; the 5 oldest are gone.
- Prune atomicity: monkey-patch the transaction to fail the prune step → the new row must NOT be present (rollback verified), and the service still returns the `BenchmarkResult` to the caller (failure-isolated).

### `packages/server/src/routes/encode-profiles.benchmark.test.ts` (new)

- POST with valid body + stubbed `benchmarkProfile` → 200, body matches `BenchmarkResponseSchema`.
- POST while `isBenchmarkBusy()` → 409 with `{ error: { message: 'benchmark_busy' } }`.
- POST with invalid body (missing `hwAccel`) → 400.
- GET `/benchmark/history` with an empty table → 200, `{ items: [] }`.
- GET `/benchmark/history` with 3 seeded rows → 200, `items.length === 3`, ordered by `createdAt` DESC.
- GET `/benchmark/history` with 150 seeded rows → 200, `items.length === 100` (route-level take cap as a belt-and-braces check against a prune failure).

### Client

- No component-level tests required for the dialog (visual-qa covers it). Add a small `useBenchmarkEncodeProfile` unit test only if the existing hooks have test coverage; spot-check suggests they don't, so skip.

### Playwright (visual-qa handoff, not implemented in this PR)

List of scenarios for `visual-qa` to verify manually:

- Opening the profile dialog shows the toggle ON and the resolution picker hidden.
- Toggling OFF reveals the 3-button picker with `720p` preselected.
- Saving with a known-good CPU + AVC + low bitrate profile shows `検証中…` briefly, then closes.
- Saving with an impossible profile (e.g. `hwAccel=nvenc` on a host with no GPU) shows the failure AlertDialog with the stderr excerpt.

## Rollout steps

Each step is sized for one specialist agent in one sitting. Ordered because some downstream steps type-check against upstream outputs.

| # | Step | Owner | Depends on | Notes |
|---|------|-------|------------|-------|
| 1 | Add `Resolution` enum + `keepOriginalResolution` / `resolution` columns on `EncodeProfile` to `schema.prisma` | backend | — | First half of the combined migration; don't run `migrate dev` yet |
| 2 | Add `BenchmarkLog` model to `schema.prisma`; run `bunx prisma migrate dev --name add_resolution_and_benchmark_log` so both model changes land in **one** migration | backend | 1 | Commit: `feat(server): add resolution fields and benchmark log table` |
| 3 | Extend `EncodeProfile.dto.ts` with `ResolutionSchema` + new fields + `BenchmarkLogSchema` + `BenchmarkHistoryResponseSchema`; extend `serialize()` and create/update handlers in `routes/encode-profiles.ts` | backend | 2 | Commit: `feat(server): expose resolution fields on encode-profile API` |
| 4 | Extend `buildFfmpegArgs` in `lib/ffmpeg.ts` with scale-filter insertion per hwAccel + the `buildRateControlFlags` helper; export `RESOLUTION_DIMENSIONS`; add scale-filter and rate-control test cases in `ffmpeg.test.ts` | streaming | 3 | Commit: `feat(ffmpeg): per-hwaccel scale filter and rate-control flags` |
| 5 | Add `buildBenchmarkArgs` in `lib/ffmpeg.ts`; add matching unit tests (including the benchmark-vs-recording parity case) | streaming | 4 | Commit: `feat(ffmpeg): benchmark arg builder` |
| 6 | Create `services/encode-benchmark.ts` (single-flight + AbortController + `BenchmarkLog` insert + prune transaction); add `encode-benchmark.test.ts` with Bun.spawn stub + persistence/prune cases | streaming | 5 | Commit: `feat(server): encode profile benchmark service` |
| 7 | Add `POST /api/encode-profiles/benchmark` + `GET /api/encode-profiles/benchmark/history` routes; add route-level tests including empty/populated/capped history | backend | 6 | Commit: `feat(server): benchmark endpoints` |
| 8 | Update `types/EncodeProfile.ts` and `hooks/useEncodeProfiles.ts` (add `useBenchmarkEncodeProfile` + `useBenchmarkHistory`) | frontend | 7 | Commit: `feat(client): benchmark mutation and history hooks` |
| 9 | Extend `ProfileDialog` with the toggle + resolution picker + benchmark-then-save flow + failure AlertDialog; wire into `EncodeTab` | frontend | 8 | Commit: `feat(client): resolution picker and benchmark gating in profile dialog` |
| 10 | Add the ベンチマーク履歴 section under the profile list in `settings.tsx` — table rendered from `useBenchmarkHistory()` with the column mapping in the Client changes section | frontend | 9 | Commit: `feat(client): benchmark history panel` |
| 11 | Playwright UX spec covering toggle visibility + failure-path AlertDialog + the history table rendering a mocked row (visual only, no real FFmpeg) | visual-qa | 10 | Spec file under `tests/ux/encode-profile-benchmark.spec.ts`; commit by qa |
| 12 | Full run: `bunx --bun tsc -b --noEmit`, `bunx --bun @biomejs/biome check --write`, `bun test`; squash or preserve phased commits, open PR | qa | 11 | PR title: `feat: encode profile resolution picker, benchmark, and history` |

## Risks & mitigations

- **FFmpeg scale filter compatibility per hwAccel.** NVEnc wants `scale_cuda`, QSV wants `scale_qsv`, VAAPI wants `scale_vaapi` inside the upload chain. Wrong filter names will silently break encoding on that hardware.
  - Mitigation: cover all four hwAccel × scale cases in `ffmpeg.test.ts` (step 3). `streaming` agent cross-checks against FFmpeg 6.x docs for each filter's exact parameter syntax (`w=` vs positional) before writing the generator.
- **VAAPI filter chain must be one `-vf` not two.** FFmpeg only keeps the last `-vf`; two flags silently drop the upload step.
  - Mitigation: the VAAPI test asserts `flagValue(args, '-vf') === 'format=nv12,hwupload,scale_vaapi=w=W:h=H'` — a single concatenated string.
- **Benchmark doesn't reflect real MPEG-TS workload.** `testsrc2` is a synthetic color bar; real broadcast streams carry interlacing and variable bitrates that hit the decoder.
  - Mitigation: document in the dialog footnote that the benchmark only validates the encoder side; users with tuner hardware should also test-record once. Don't over-engineer a "real sample" pipeline in this pass.
- **AbortController doesn't reliably kill FFmpeg on all platforms.** `Bun.spawn` signal handling on macOS vs Linux differs for child processes that ignore SIGTERM.
  - Mitigation: two-stage kill — `SIGTERM` then 1 s grace then `SIGKILL`. Same pattern `transcoder.ts` uses on abort.
- **Single-flight gate blocks legitimate parallel users.** If two admins open the dialog simultaneously, one gets 409.
  - Mitigation: accept the limitation — app has no multi-admin story. Client shows a clear error toast, user retries.
- **Drift between benchmark cmd and real recording cmd.** If `buildBenchmarkArgs` and `buildFfmpegArgs` diverge, the probe becomes meaningless.
  - Mitigation: share `buildHwPreInput` and `buildVideoFlags` between them (the current un-exported helpers in `ffmpeg.ts:121–184` — expose them or keep them internal and call both builders through one module). Add a test asserting both pipelines emit the same `-c:v` / `-preset` / `-b:v` tail for a given input.
- **30 s hard cap may fire on slow HDDs / first-time driver load.** NVEnc can spend 2–3 s just loading the CUDA runtime on a cold GPU.
  - Mitigation: 30 s is ~6× a 5 s benchmark, which is generous. If we see false timeouts in the wild, raise to 45 s.

- **`BenchmarkLog` table grows unbounded if the prune fails.** A partial transaction or a Postgres hiccup could leave rows unpruned.
  - Mitigation: insert + prune run inside a single `prisma.$transaction`; if the prune throws, the insert rolls back, so the table cannot exceed 101 rows between steps. A route-level `take: 100` on `GET /benchmark/history` also caps what the UI ever sees, in case the prune does drift.
- **History table leaks stale hardware assumptions.** A user swaps a GPU; their old `nvenc` entries stay in the table and confuse them.
  - Mitigation: the last-100 retention naturally ages out stale rows within a day or two of real use. The UI shows the timestamp prominently so the user can tell "old" from "new". No scheduled cleanup needed in this pass.

## Rollout / validation

Manual flow after step 10:

1. Open `/settings` → エンコード tab → 新規プロファイル
2. Name `テスト`, codec AVC, hw CPU, default bitrate. Toggle "オリジナルの解像度を維持" OFF → pick 720p → 作成.
3. Expected: button turns to "検証中…" for ~6 s, success toast, profile appears in the list.
4. Edit the same profile → set hwAccel=NVEnc on a CPU-only dev box → 更新.
5. Expected: AlertDialog with fps=0 and stderr excerpt ("Cannot load nvcuda.dll" / "No NVENC capable devices found").
6. Click このまま保存 → profile saves anyway.
7. Scroll to ベンチマーク履歴 section → two rows visible: the successful CPU run (green check) and the failed NVEnc run (red ×, hover shows stderr reason). Most recent row at top.
8. Run 99 more benchmarks (or seed via SQL) → table still shows only 100 rows; the very first CPU row from step 3 has fallen off.

CI / test gates:

- `bun test` in `packages/server` passes (includes new `ffmpeg.test.ts` and `encode-benchmark.test.ts` cases).
- `bunx --bun tsc -b --noEmit` at repo root.
- `bunx --bun @biomejs/biome check` at repo root.
- Playwright UX spec passes with a mocked `/api/encode-profiles/benchmark` returning both `ok:true` and `ok:false`, and a mocked `/api/encode-profiles/benchmark/history` rendering at least one row.

## Open questions

Resolved — see the Decisions log at the top of this document. Sub-decisions recorded inline in the relevant sections (Schema changes, DTO / API changes, FFmpeg changes, Benchmark service, Client changes, Tests, Rollout steps, Risks & mitigations).
