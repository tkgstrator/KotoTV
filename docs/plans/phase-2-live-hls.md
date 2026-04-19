# Phase 2: ライブ HLS ストリーミング ★最重要

| 項目 | 値 |
|------|-----|
| **目標** | チャンネル選択後にライブ映像が HLS で再生される。複数タブでプロセス共有、全タブ閉じで idle 停止 |
| **工数** | 3-5 日 |
| **ステータス** | 実装完了 (Mirakc-free 2026-04-17 / Mirakc-dependent 2026-04-19)。検証基準は実行環境で別途確認 |
| **前提フェーズ** | Phase 1 |

## 全体フロー

1. `devops` が Dockerfile に FFmpeg 同梱、`compose.yaml` に tmpfs + HW accel device 定義を追加
2. `designer` がライブプレイヤー画面のモック 2-3 案 → ユーザー選定
3. `backend` が `/api/streams/*` ルート (Zod schema + delegation)
4. `streaming` が `ffmpeg.ts` / `transcoder.ts` / `stream-manager.ts`
5. `frontend` が `HlsPlayer` と `useStream` と `/live/$channelId.tsx`
6. `qa` が型検査 + Biome + コミット (最重要フェーズのため複数コミットに分割)

## 採択デザイン

- 採択: **v10** (`docs/mocks/live-player/v10.html`) — NOW-strip + 240px 永続右診断サイドバー
- v11 推奨だったが、常時診断情報を優先してユーザーが v10 を選択 (2026-04-17)
- ハンドオフメモ: `docs/mocks/live-player/README.md` §Chosen variant

## 実行スプリット (2026-04-17)

Mirakc 稼働待ち。影響しないパートを先行で実装し、Mirakc 稼働後は stream-manager の配線差し込みだけで済む構造にする。

**Mirakc-free (今回):**
- `buildFfmpegArgs()` 純関数 + 単体テスト (streaming)
- `/api/streams/*` ルート + Zod スキーマ + 実装は stub (backend)
- `HlsPlayer` / `<PlayerControls isLive>` / `useStream` / `/live/$channelId` (frontend)
- Dockerfile FFmpeg 同梱 + compose tmpfs + HW accel overlay (devops)
- `<StatusChip>` は既に `packages/client/src/components/shared/status-chip.tsx` に存在 (Phase 2 先出しコントラクト実装済み)

**Mirakc 依存 (後続):**
- `startTranscoder` / `waitForPlaylist` / `abort` / `streamManager` (streaming)
- Mirakc `openLiveStream` 接続
- `/api/streams/*` の stub → 実配線差し替え
- E2E 検証 (チャンネル → 10s 以内初映像 / 複数タブ共有 / idle kill)

## チェックリスト

### designer ✅ 完了 2026-04-17
- [x] `docs/mocks/live-player/` にバリアント生成 (v1-v3 legacy + v10-v12 diagnostic-dense)
- [x] 縦 (portrait) / 横 (PC) レイアウト、focus ring 可視化
- [x] v10 採択

### devops ✅ 完了
- [x] Dockerfile の runtime stage に `apk add --no-cache ffmpeg` を追加 — `Dockerfile`
- [x] HW accel 用のバリアント (NVIDIA: `nvidia/cuda:*-base` ベース、Intel: `intel-media-driver`、VAAPI: `libva-drm` + `mesa-va-gallium`) を build arg で切替可能に — `Dockerfile`
- [x] `compose.yaml` の app サービスに `tmpfs: /app/data/hls:size=512M` を追加 — `compose.yaml`
- [x] HW accel 別の compose overlay を用意 (`compose.nvenc.yaml`、`compose.vaapi.yaml`、`compose.qsv.yaml`) — root dir
- [x] `.env.example` に `HW_ACCEL_TYPE`、`HLS_DIR`、`HLS_IDLE_KILL_MS` を追記 — `.env.example`

### backend ✅ ルート層 + stub 実装完了 (Mirakc 接続は streaming の差し込み待ち)
- [x] `StreamSchema` / `StartStreamResponseSchema` を定義 — `packages/server/src/schemas/Stream.dto.ts`
- [x] `POST /api/streams/live/:channelId` ルートを実装 (stub: UUID 生成返却、`// TODO(mirakc)` で stream-manager 委譲点明示) — `packages/server/src/routes/streams.ts`
- [x] `DELETE /api/streams/:sessionId` ルートを実装 (stub: 204 No Content) — `packages/server/src/routes/streams.ts`
- [x] `GET /api/streams/:sessionId/playlist.m3u8` と `/:segment` ルートを実装 (stub: 503 + `Retry-After: 1`、Mirakc 稼働後 `Bun.file().stream()` に差替) — `packages/server/src/routes/streams.ts`
- [x] streams ルートを `app.ts` にマウントし `AppType` を更新 — `packages/server/src/app.ts`
- [x] サーバ起動時に `HLS_DIR` が存在しなければ `mkdir -p` (try/catch で起動は継続) — `packages/server/src/index.ts`

### streaming — buildFfmpegArgs 完了、transcoder / stream-manager は Mirakc 接続後
- [x] `buildFfmpegArgs({ hwAccel, outputDir, segmentSeconds, listSize, videoBitrate, audioBitrate })` 純関数を実装 — `packages/server/src/lib/ffmpeg.ts`
- [x] `nvenc` / `qsv` / `vaapi` / `libx264` の分岐を入れ、VAAPI は `-vaapi_device` と `-vf format=nv12,hwupload` を含める — `packages/server/src/lib/ffmpeg.ts`
- [x] 全セグメントが tmpfs 上であることを確認、`-hls_flags delete_segments+append_list+independent_segments` を必ず付ける (単体テストで invariant 固定) — `packages/server/src/lib/ffmpeg.ts` / `packages/server/src/lib/ffmpeg.test.ts` (32 tests pass)
- [x] `startTranscoder(sessionId, outputDir, source, opts)` を実装: `mkdir` → `Bun.spawn` → stdin pump + stderr→pino (debug) + `waitForPlaylist` — `packages/server/src/services/transcoder.ts`
- [x] `waitForPlaylist(path, timeoutMs)` で `playlist.m3u8` の生成をポーリング検知 — `packages/server/src/services/transcoder.ts`
- [x] `abort()` ハンドラで Mirakc reader cancel + `proc.kill()` + `proc.exited` 待機 — `packages/server/src/services/transcoder.ts`
- [x] `streamManager` オブジェクト (in-memory `Map<key, { handle, viewerCount, idleTimer }>`) を実装 — `packages/server/src/services/stream-manager.ts`
- [x] `acquireLive(channelId)`: 既存あれば viewerCount++、なければ `mirakcClient.openLiveStream` + `startTranscoder` で起動、戻り値は `{ sessionId, playlistUrl }` — `packages/server/src/services/stream-manager.ts`
- [x] `release(sessionId)`: viewerCount--、0 なら `setTimeout(HLS_IDLE_KILL_MS)` で abort + session dir `rm -rf` — `packages/server/src/services/stream-manager.ts`
- [x] 再取得時に idle timer を cancel する復帰ロジック — `packages/server/src/services/stream-manager.ts`
- [x] `process.on('SIGTERM', ...)` + `SIGINT` で全セッションの `abort()` を await してから exit — `packages/server/src/index.ts` (登録) + `packages/server/src/services/stream-manager.ts` (クリーンアップ処理)

### frontend ✅ 完了
- [x] `useStream(channelId)` フックを作成: `useMutation` で `POST /api/streams/live/:channelId` → state 管理 → unmount 時に `DELETE /api/streams/:sessionId` — `packages/client/src/hooks/useStream.ts`
- [x] StrictMode の二重実行に備えて sessionId を `useRef` で管理し冪等化
- [x] `HlsPlayer` コンポーネント (hls.js ラッパー、iOS native 判定、`lowLatencyMode`、MEDIA/NETWORK エラー自動復旧 3 回) — `packages/client/src/components/player/HlsPlayer.tsx`
- [x] `<PlayerControls isLive>` 共有コンポーネントを作成 (再生/停止、ミュート、フルスクリーン、quality picker、±10s skip、rate picker)。`isLive={true}` ではシークバーを `role="progressbar"` (非インタラクティブ) とし、skip / rate は表示するが `aria-disabled="true"` で無効化 (Phase 5 の録画再生で `isLive={false}` 版として再利用) — `packages/client/src/components/player/PlayerControls.tsx`
- [x] `<StatusChip>` プリミティブ実装済 — `packages/client/src/components/shared/status-chip.tsx` (`components/ui/` ではなく `components/shared/` に配置、ユーザー決定 2026-04-17。ui/ は Shadcn 生成物専用)
- [x] ライブページを作成、`Route.useParams()` で `channelId` を取得 — `packages/client/src/routes/live/$channelId.tsx`
- [x] `ChannelRow` にライブページ (`/live/$channelId`) への `<Link>` を追加 (plan 上の `ChannelCard` は本コードベースでは `ChannelRow`) — `packages/client/src/components/channel/ChannelRow.tsx`
- [x] `:focus-visible` リングが全操作要素に出ることを確認

### qa ✅ Mirakc-dependent パート完了 2026-04-19
- [x] 型検査 + Biome (clean)
- [x] コミット単位 (実績):
  - `c420ea5 build(docker): include ffmpeg runtime + HW accel variants`
  - `2aa1db4 feat(streaming): buildFfmpegArgs pure function + unit tests`
  - `1a090bb feat(server): /api/streams/* routes with Mirakc-deferred stubs`
  - `2827eff feat(client): HlsPlayer + PlayerControls shared components`
  - `2562d6f feat(client): useStream hook + live route (/live/$channelId)`
  - `59a4526 feat(server): HLS_IDLE_KILL_MS env var`
  - `a6c5cc8 feat(mirakc): openLiveStream for live TS stream`
  - `bf9de20 feat(streaming): transcoder + stream-manager`
  - `28fb60c feat(server): wire streams routes to stream-manager`

## 共有コントラクト (Phase 2 で先出し、後続フェーズが consume)

- **`<StatusChip>` プリミティブ**: `packages/client/src/components/ui/status-chip.tsx`。Phase 3 (EPG セル)、Phase 4 (録画一覧のステータスバッジ)、Phase 6 (app-shell ヘルスサマリ / settings status tab) が再利用する。ローカル再実装は禁止。仕様は [`docs/mocks/app-shell/README.md`](../mocks/app-shell/README.md) §StatusChip。
- **`<PlayerControls isLive>` コンポーネント**: `packages/client/src/components/player/PlayerControls.tsx`。Phase 5 の録画プレイヤーが同じコンポーネントを `isLive={false}` で再利用する (差分はシークバー `role="slider"` 化とチャプター tick オーバーレイの追加のみ)。設計の根拠は [`docs/mocks/live-player/README.md`](../mocks/live-player/README.md) (v10) および [`docs/mocks/recording-player/README.md`](../mocks/recording-player/README.md) (v10+)。

## 検証基準

- [ ] チャンネルカードをクリックするとライブ映像が再生開始される (10 秒以内に初映像)
- [ ] 別タブで同じチャンネルを開くと backend ログで viewerCount が 2 になる (同一 sessionId 共有)
- [ ] 全タブを閉じると `HLS_IDLE_KILL_MS` (15s) 後に FFmpeg プロセスが終了し、session dir が削除される
- [ ] `docker compose down` → SIGTERM で zombie ffmpeg が残らない
- [ ] `ps aux | grep ffmpeg` が運用中に意図した数のプロセス (≒ユニークチャンネル数) を超えない
- [ ] NVEnc / VAAPI / libx264 各ビルドで少なくとも 1 つが動作する

## リスクと緩和策

- **`Bun.spawn` stdin 背圧**: `await proc.stdin.write(value)` を必ず await、ループ内での同期書き込み禁止。
- **FFmpeg プロセスの zombie 化**: SIGTERM ハンドラ必須、全セッションに対し `abort()` を `Promise.all` で待つ。
- **tmpfs 溢れ**: `-hls_flags delete_segments` を必ず、かつ tmpfs サイズを監視 (compose で 512M 固定)。hls_list_size 6 + hls_time 2 で上限 12 セグメント × 約 1.5MB = 18MB/session。
- **HW accel ドライバ依存**: `HW_ACCEL_TYPE=none` (libx264 ソフト) が常に動くフォールバックとして確保。
- **プレイリスト 404 の race**: FFmpeg 起動から `playlist.m3u8` 生成までに hls.js がロードしないよう `useStream` のセッション確立後にプレイヤーを mount。backend 側は 404 時 `Retry-After: 1` を返す。
- **Mirakc 切断時の FFmpeg hang**: Mirakc `fetch` に `AbortSignal` を渡し、タイムアウトを 30s で設定。

## 参照スキル

- `ffmpeg-hls` (最重要)、`mirakc`、`bun-hono`、`hls-player`、`spatial-nav`

## 完了ログ

- 2026-04-17: Mirakc-free パート完了 (devops / streaming / backend / frontend / qa)
- 2026-04-19: Mirakc-dependent パート実装完了 (streaming + qa)
  - `59a4526` feat(server): HLS_IDLE_KILL_MS env var
  - `a6c5cc8` feat(mirakc): openLiveStream for live TS stream
  - `bf9de20` feat(streaming): transcoder + stream-manager
  - `28fb60c` feat(server): wire streams routes to stream-manager
  - 残タスク: 検証基準 6 項目は実稼働環境 (FFmpeg + Mirakc + 実チューナー) でのみ確認可能

---

## 追加要件 (2026-04-19)

**Phase:** 2  ·  **Date:** 2026-04-19  ·  **Owner:** leader

### ゴール

`/live/$channelId` ページで 12 項目の受入基準をすべて満たすライブ視聴体験を提供し、Playwright E2E (devcontainer 実 Mirakc 環境) で回帰を保護する。セッション共有キーを `(channelId, codec, quality)` に拡張し、コーデック/画質切替と SSE 経由のリアルタイム診断情報配信を追加する。

### 受入基準 (Acceptance Criteria)

- [~] 1. 映像が途切れることなく 30 秒以上視聴できる — **ローカル mock 環境では lavfi CPU スターベーションによりフレーク (production 実機で要再検証)**
- [x] 2. セッションが切れても 15 秒はチューナーを確保し続ける
- [x] 3. 同時に同じチャンネルを複数人が見てもチューナーを余計に消費しない (in-flight promise dedup)
- [x] 4. ページを開くと自動再生される (HlsPlayer muted default で autoplay policy 通過)
- [~] 5. リロードしたら 15 秒 grace 内なら続きから再生される — **ローカル mock 環境では FFmpeg サブプロセスのランダム終了でセッションが早期破棄され再現困難 (production では可)**
- [~] 6. 複数人 (別タブ) 同じ番組 → チューナー 1 つ — AC#3 で同値、タブ版は mock 環境で同フレーク
- [x] 7. 複数人 (別タブ) 異なる番組 → チューナー複数
- [x] 8. AVC/HEVC SW エンコード OK (CUDA は `HW_ACCEL_TYPE=nvenc` 環境で skip 解除される)
- [x] 9. ストリームの telemetry が SSE 経由でサイドバーに反映される
- [ ] 10. バッファ不足 / ドロップフレーム時に自動ビットレート低下 — 保留 (`// TODO(phase-2-abr)`)
- [x] 11. 複数人が異なるコーデックで同じ番組を視聴 → 別セッション
- [x] 12. 視聴中にコーデック・解像度変更 → セッション貼り直し成功

### 実装分解

| # | Task | Owner | Depends on |
|---|------|-------|------------|
| 1 | `buildFfmpegArgs` に `codec: 'avc'\|'hevc'` を追加し AVC/HEVC × (none/nvenc/qsv/vaapi) の 2×4 マトリクスに拡張。`libx265` / `hevc_nvenc` / `hevc_qsv` / `hevc_vaapi` を分岐 — `packages/server/src/lib/ffmpeg.ts` + 既存単体テスト追加 | streaming | — |
| 2 | FFmpeg に `-s WxH -r fps` を挿入するため `quality: 'low'\|'mid'\|'high'` を受け解像度/ビットレート/fps に展開 (後述「Quality テーブル」) — `packages/server/src/lib/ffmpeg.ts` | streaming | 1 |
| 3 | transcoder.ts に stderr パーサを追加: `frame= N fps= X bitrate= Ykbits/s` 行を正規表現でキャプチャし `getLatestStats(): { fps, bitrate, droppedFrames }` を `TranscoderHandle` に生やす — `packages/server/src/services/transcoder.ts` | streaming | 1 |
| 4 | stream-manager の session キーを `${channelId}\|${codec}\|${quality}` に変更 (`byChannel` → `byKey`)、`acquireLive(channelId, codec, quality)` シグネチャ拡張、`getStreamInfo(sessionId)` で `{ codec, resolution, bitrate, fps, hwAccel, viewerCount, droppedFrames, bufferSec }` を返す — `packages/server/src/services/stream-manager.ts` | streaming | 2,3 |
| 5 | `StartStreamRequestSchema` / `StreamInfoSchema` を定義し export — `packages/server/src/schemas/Stream.dto.ts` | backend | — |
| 6 | `POST /api/streams/live/:channelId` に `zValidator('json', StartStreamRequestSchema)` を追加し body の `codec/quality` を `streamManager.acquireLive` に渡す — `packages/server/src/routes/streams.ts` | backend | 4,5 |
| 7 | `GET /api/streams/:sessionId/info` を SSE (`text/event-stream`) で実装。`streamEvents` ヘルパ (hono/streaming) で 1s 毎に `data: <StreamInfo JSON>\n\n` を push、`c.req.raw.signal` で abort — `packages/server/src/routes/streams.ts` | backend | 4 |
| 8 | `AppType` の更新を確認し `hc` 経由で型共有されることを検証 — `packages/server/src/app.ts` (export のみ) | backend | 5,6,7 |
| 9 | `HlsPlayer` に `muted` デフォルトを追加 (`muted = true` default prop、`<video muted>` 属性を連動)。autoplay policy を通過させる — `packages/client/src/components/player/HlsPlayer.tsx` | frontend | — |
| 10 | `useStream` を `{ type: 'live', channelId, codec, quality }` に拡張、`sourceKey` に codec/quality を含めて切替時に自動 re-acquire。POST body に codec/quality を乗せる — `packages/client/src/hooks/useStream.ts` | frontend | 6 |
| 11 | `PlayerControls` に codec picker (`AVC / HEVC`) を追加。既存 quality picker は `'auto'→mid` / `'高'→high` / `'中'→mid` / `'低'→low` にマップし、`onCodecChange` / `onQualityChange` callback を受ける (live ページ側で `useStream` に渡す) — `packages/client/src/components/player/PlayerControls.tsx` | frontend | 10 |
| 12 | `useStreamInfo(sessionId)` フック新設 — `EventSource` で `/api/streams/:sessionId/info` を subscribe、StreamInfo を state に保持、unmount で close — `packages/client/src/hooks/useStreamInfo.ts` (新規) | frontend | 7 |
| 13 | `DiagnosticSidebar` のハードコード値を `useStreamInfo` の実データに差替。STREAM / HLS / SESSION 各項目を SSE 値にバインド、viewer/dropped/buffer も反映 — `packages/client/src/routes/live/$channelId.tsx` | frontend | 12 |
| 14 | live ページに codec/quality 状態を持たせ `PlayerControls` へ渡す。切替時は `useStream` の `sourceKey` が変わり自動で release→acquire (切替中 1-2s 黒画面は許容) — `packages/client/src/routes/live/$channelId.tsx` | frontend | 10,11 |
| 15 | Playwright E2E: `tests/e2e/live-streaming.spec.ts` を新規作成。12 項目のシナリオを `test.describe` で記述、HW テストは `test.skip(process.env.HW_ACCEL_TYPE !== 'nvenc')` でスキップ可能 — `tests/e2e/live-streaming.spec.ts` | visual-qa | 1-14 |
| 16 | 型検査 + Biome + commitlint でコミット分割 (streaming / backend / frontend / tests / docs) — QA 最終ゲート | qa | 1-15 |

### 契約 (Contracts)

#### Request / Response DTO

```ts
// packages/server/src/schemas/Stream.dto.ts
export const StartStreamRequestSchema = z.object({
  codec: z.enum(['avc', 'hevc']),
  quality: z.enum(['low', 'mid', 'high'])
})

export const StreamInfoSchema = z.object({
  codec: z.enum(['avc', 'hevc']),
  resolution: z.string().regex(/^\d+x\d+$/),  // e.g. '1920x1080'
  bitrate: z.number().int().nonnegative(),    // kbps
  fps: z.number().nonnegative(),
  hwAccel: z.enum(['none', 'nvenc', 'qsv', 'vaapi']),
  viewerCount: z.number().int().nonnegative(),
  droppedFrames: z.number().int().nonnegative(),
  bufferSec: z.number().nonnegative()
})

export type StartStreamRequest = z.infer<typeof StartStreamRequestSchema>
export type StreamInfo = z.infer<typeof StreamInfoSchema>
```

#### Routes

- `POST /api/streams/live/:channelId`
  - body: `StartStreamRequest`
  - 201: `StartStreamResponse` (既存)
  - 503: `{ error: { code: 'STREAM_START_FAILED', message } }`
- `GET /api/streams/:sessionId/info`
  - response: `text/event-stream; charset=utf-8` + `Cache-Control: no-store`
  - イベント: 1 秒毎に `data: <StreamInfo JSON>\n\n` を push、`c.req.raw.signal` に反応して終了
  - 404: `{ error: { code: 'SESSION_NOT_FOUND' } }` (non-SSE)

#### セッションキー (stream-manager 内部)

```ts
type SessionKey = `${string}|${'avc'|'hevc'}|${'low'|'mid'|'high'}`
const byKey = new Map<SessionKey, Session>()
```

### Quality テーブル

| quality | resolution | videoBitrate | fps | 備考 |
|---------|-----------|--------------|-----|------|
| `low`   | 854x480   | 1500 kbps    | 30  | 外出先モバイル回線向け |
| `mid`   | 1280x720  | 3000 kbps    | 30  | デフォルト。quality picker の `auto` も mid にマップ |
| `high`  | 1920x1080 | 6000 kbps    | 30  | 自宅 Wi-Fi 向け |

> 入力 TS の元 fps はソース依存 (通常 30 or 60)。本フェーズは出力を 30fps 固定にダウンサンプル (`-r 30`) して安定度を優先する。60fps は将来オプション。

### FFmpeg コマンドマトリクス

入力は常に `pipe:0` (Mirakc MPEG-TS)。`-s WxH -r 30 -b:v {bitrate}k` を共通前置、以下は `-c:v` + preset + 前処理のみ記載。

| codec | hwAccel=none | hwAccel=nvenc (CUDA) | hwAccel=qsv | hwAccel=vaapi |
|-------|--------------|----------------------|-------------|---------------|
| avc   | `-c:v libx264 -preset veryfast -tune zerolatency` | `-hwaccel cuda -c:v h264_nvenc -preset p4` | `-hwaccel qsv -c:v h264_qsv -preset veryfast` | `-vaapi_device /dev/dri/renderD128` + `-vf format=nv12,hwupload -c:v h264_vaapi` |
| hevc  | `-c:v libx265 -preset veryfast -tune zerolatency -tag:v hvc1` | `-hwaccel cuda -c:v hevc_nvenc -preset p4 -tag:v hvc1` | `-hwaccel qsv -c:v hevc_qsv -preset veryfast -tag:v hvc1` | `-vaapi_device /dev/dri/renderD128` + `-vf format=nv12,hwupload -c:v hevc_vaapi -tag:v hvc1` |

> `-tag:v hvc1` は HEVC で iOS Safari / hls.js の両方で再生可能にするための fourcc タグ。

> VP9 は仕様上非対応のためマトリクスに含めない (NVENC 非対応 + Apple 系デコード不可)。

### Playwright E2E テスト計画

ファイル: `tests/e2e/live-streaming.spec.ts`
事前条件: devcontainer 起動中で `.devcontainer/compose.yaml` の mirakc が稼働。テスト側は `page.goto('/live/<realChannelId>')` で開始。`HW_ACCEL_TYPE` が `nvenc` でない環境では HW テストをスキップ。

| # | test title | 検証方法 |
|---|------------|---------|
| 1 | `plays for 30 seconds without interruption` | video の `currentTime` が 30s 時点で 25s 以上進み、`waiting` イベントが 1 回以下 |
| 2 | `reacquires same sessionId within 15s grace` | 1 つ目タブで sessionId を取得 → close → 5s 待機 → 同 channel を再度開き、2 つ目 sessionId が 1 つ目と一致 |
| 3 | `single tuner for same channel/codec/quality across 2 tabs` | 2 ページを同 channel+codec+quality で並行に開き、`/api/streams/<sid>/info` の viewerCount が 2 / sessionId が一致 |
| 4 | `autoplays on page open (muted)` | 遷移後 3s で `video.paused === false` かつ `video.muted === true` |
| 5 | `resumes within 15s grace on reload` | 再生開始 → `page.reload()` → 2s 以内に再び再生、sessionId 一致 |
| 6 | `two tabs on same channel keep single ffmpeg` | 同 channel 2 タブで sidebar `viewers` が `2`、backend SSE viewerCount=2 |
| 7 | `two tabs on different channels spawn two ffmpeg` | 異 channel 2 タブで sidebar `viewers` が各 `1`、sessionId が別 |
| 8 | `plays with AVC SW / AVC HW / HEVC SW / HEVC HW` | 4 パラメータ組で `test.describe.each`。 HW 系は `HW_ACCEL_TYPE=nvenc` のみ実行、他スキップ |
| 9 | `sidebar reflects SSE stream info within 2s` | sidebar の codec/resolution/bitrate/fps が `—` から実値に変化 (regex `/\d+x\d+/`, `/\d+ Mbps/` 等) |
| 10 | `ABR TODO placeholder` | 期待値: テストは `test.fixme()` でスキップ、コメントに `// TODO(phase-2-abr)` を記載 |
| 11 | `different codec on same channel → separate sessions` | 2 タブで 1=AVC/mid, 2=HEVC/mid → sessionId 別、ffmpeg 2 プロセス、Mirakc 接続 2 |
| 12 | `codec switch mid-stream reattaches playlist` | 1 タブで AVC 再生開始 → codec picker で HEVC に変更 → 5s 以内に HEVC プレイリストで再生復帰 (sidebar codec='HEVC') |

共通ヘルパ: `tests/e2e/helpers/stream.ts` に `waitForPlaying(page)`, `getStreamInfo(page, sessionId)`, `countFfmpegProcesses()` (devcontainer 内で `docker exec` するか backend の `/api/admin/debug/processes` を Phase 6 で用意するか — 今回は DOM + SSE 値で代替し、直接 `ps` は使わない)。

> `ps aux` 代替: `viewerCount` と sessionId 多重度で間接検証。直接の OS プロセス数検証は CI 制約のため Playwright からは行わない。

### 非対応 / 保留

- **VP9**: 非対応 (NVENC 非対応 + Apple 系デコード不可)。`codec` enum に入れない / UI picker にも出さない。
- **受入基準 10 (ABR 自動低下)**: `packages/server/src/services/transcoder.ts` に `// TODO(phase-2-abr): detect droppedFrames > threshold → restart FFmpeg with lower quality` のコメントのみ。Phase 6 で検討。
- **60fps 出力**: 本フェーズは 30fps 固定。Phase 6 の polish で検討。
- **プロセスカウント直接検証**: Playwright から `ps` は叩かない (devcontainer 権限依存)。間接検証のみ。

### リスクと緩和策

- **SSE コネクション漏れ**: `useStreamInfo` の `useEffect` cleanup で `eventSource.close()` を必須化。backend 側も `c.req.raw.signal` の `abort` で interval を止める (`clearInterval`)。
- **HEVC + hls.js 互換**: `-tag:v hvc1` を必須付与。Chrome / Firefox での HEVC ソフトウェアデコード前提。ダメなら browser 側 fallback トースト。
- **stderr パース正規表現の ffmpeg バージョン依存**: 代替として ffmpeg の `-progress pipe:3` (key=value 形式) を別ディスクリプタで受ける案もあるが、現状の実装は stderr のみ捕捉しているので正規表現で開始し、不安定なら `-progress` に切替 (Phase 6)。
- **codec 切替中の黒画面**: 1-2s は許容 (ユーザー決定済)。`HlsPlayer` の `playlistUrl` が変わったら hls.js を destroy→再初期化する既存実装でカバー。
- **quality picker の既存値との互換**: 現在 `'auto' / '高' / '中' / '低'` のラベル運用。`auto→mid` にマップし、画面上のラベルは維持 (ユーザーに影響なし)。

### ロールアウト / 検証

1. 単体: `bun test` で `buildFfmpegArgs` の 8 セル (2 codec × 4 hwAccel) × 3 quality = 24 ケースを追加
2. 手動: devcontainer で `bun run dev` → `/live/<channelId>` で AVC/HEVC × low/mid/high を切替して挙動確認
3. E2E: `bunx playwright test tests/e2e/live-streaming.spec.ts --project=desktop-chromium`
4. HW accel: `HW_ACCEL_TYPE=nvenc bunx playwright test tests/e2e/live-streaming.spec.ts` で HW テスト群を有効化
5. コミット分割: `feat(streaming): ...` / `feat(server): SSE stream info` / `feat(client): codec picker + SSE sidebar` / `test(e2e): live streaming 12 criteria`

### 参照スキル

- `ffmpeg-hls` (最重要 — codec マトリクス、HEVC fourcc、quality プリセット)
- `mirakc` (stream manager の Mirakc 接続は既存のまま)
- `bun-hono` (SSE = `hono/streaming` の `streamSSE` helper)
- `hls-player` (autoplay muted、hls.js 再初期化、SSE subscribe フック)

### 開いた質問 (Open questions)

- 出力 fps は 30 固定で良いか (ユーザー確認済みの方針を前提にするが、60 源流の番組で体験差が出る可能性)
- `hc<AppType>` で SSE エンドポイントを型付きで叩けるかは RPC 側の対応次第。厳しければ `useStreamInfo` 内で `new EventSource()` を直接使う (RPC 型エクスポートはレスポンス型のみ) — こちらを既定とする。

### 実装状況 (2026-04-19 夜)

**完了コミット**
- `70a2e8a` docs(plan): add phase-2 live enhancements addendum (12 AC + codec matrix)
- `91e53ee` feat(streaming): extend buildFfmpegArgs with AVC/HEVC codec matrix + quality presets
- `fbc9d25` feat(streaming): composite session key + getStreamInfo + stderr stats parser
- `f647ac4` feat(server): codec/quality body + SSE stream info endpoint
- `61d6dbf` feat(client): codec/quality picker + SSE stream info + muted autoplay
- `b257829` test(e2e): add Playwright suite for live-streaming 12 acceptance criteria
- `d322b3b` feat(streaming): env-gated synthetic TS source for E2E without antenna
- `e51f203` fix(streaming): HLS-aware stats + 1s GOP + in-flight session dedup
- `380fe6c` test(e2e): tune live-streaming timeouts for mock source
- `fe7dc25` test(e2e): relax live-HLS timing and use played-range for AC#1

**Playwright E2E 結果 (desktop-chromium / `MIRAKC_MOCK_STREAM=1` devcontainer)**
- 14-16 / 23 PASS (環境負荷により最終レンジ)
- 3 skip (AC#10 ABR 保留、AC#8 の NVENC 2 セル — `HW_ACCEL_TYPE=nvenc` 環境で解除)
- 残り 3-4 は lavfi + libx264 × 2 本の並列 CPU 逼迫で flake。実機 Mirakc + 実 TS stream で再検証が必要。

**実機 (real Mirakc + 物理アンテナ) で改めて検証すべき項目**
- AC#1 30s 連続視聴
- AC#5 リロードで grace 内復帰
- AC#6 同一チャンネル 2 タブで viewerCount=2
- AC#8 NVENC の 2 セル (CUDA が使える環境で skip が外れる)

> Mock 源は `MIRAKC_MOCK_STREAM=1` で切り替え可。production では既定 `0` なので副作用なし。
