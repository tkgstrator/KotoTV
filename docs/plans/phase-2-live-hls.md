# Phase 2: ライブ HLS ストリーミング ★最重要

| 項目 | 値 |
|------|-----|
| **目標** | チャンネル選択後にライブ映像が HLS で再生される。複数タブでプロセス共有、全タブ閉じで idle 停止 |
| **工数** | 3-5 日 |
| **ステータス** | 実行中 (Mirakc-free パート着手 2026-04-17) |
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

### devops
- [ ] Dockerfile の runtime stage に `apk add --no-cache ffmpeg` を追加 — `Dockerfile`
- [ ] HW accel 用のバリアント (NVIDIA: `nvidia/cuda:*-base` ベース、Intel: `intel-media-driver`、VAAPI: `libva-drm` + `mesa-va-gallium`) を build arg で切替可能に — `Dockerfile`
- [ ] `compose.yaml` の app サービスに `tmpfs: /app/data/hls:size=512M` を追加 — `compose.yaml`
- [ ] HW accel 別の compose overlay を用意 (`compose.nvenc.yaml`、`compose.vaapi.yaml`) — root dir
- [ ] `.env.example` に `HW_ACCEL_TYPE`、`HLS_DIR`、`HLS_IDLE_KILL_MS` を追記 — `.env.example`

### backend
- [ ] `StreamSchema` / `StartStreamResponseSchema` を定義 — `packages/server/src/schemas/Stream.dto.ts`
- [ ] `POST /api/streams/live/:channelId` ルートを実装 (内部で stream-manager に委譲) — `packages/server/src/routes/streams.ts`
- [ ] `DELETE /api/streams/:sessionId` ルートを実装 — `packages/server/src/routes/streams.ts`
- [ ] `GET /api/streams/:sessionId/playlist.m3u8` と `/:segment` ルートを実装 (`Bun.file().stream()` で配信) — `packages/server/src/routes/streams.ts`
- [ ] streams ルートを `app.ts` にマウントし `AppType` を更新 — `packages/server/src/app.ts`
- [ ] サーバ起動時に `HLS_DIR` が存在しなければ `mkdir -p`

### streaming
- [ ] `buildFfmpegArgs({ hwAccel, outputDir, segmentSeconds, listSize, videoBitrate, audioBitrate })` 純関数を実装 — `packages/server/src/lib/ffmpeg.ts`
- [ ] `nvenc` / `qsv` / `vaapi` / `libx264` の分岐を入れ、VAAPI は `-vaapi_device` と `-vf format=nv12,hwupload` を含める — `packages/server/src/lib/ffmpeg.ts`
- [ ] `startTranscoder(sessionId, outputDir, source, opts)` を実装: `mkdir` → `Bun.spawn` → stdin pump + stderr→pino (debug) + `waitForPlaylist` — `packages/server/src/services/transcoder.ts`
- [ ] `waitForPlaylist(path, timeoutMs)` で `playlist.m3u8` の生成をポーリング検知 — `packages/server/src/services/transcoder.ts`
- [ ] `abort()` ハンドラで Mirakc reader cancel + `proc.kill()` + `proc.exited` 待機 — `packages/server/src/services/transcoder.ts`
- [ ] `streamManager` オブジェクト (in-memory `Map<key, { handle, viewerCount, idleTimer }>`) を実装 — `packages/server/src/services/stream-manager.ts`
- [ ] `acquireLive(channelId)`: 既存あれば viewerCount++、なければ `mirakcClient.openLiveStream` + `startTranscoder` で起動、戻り値は `{ sessionId, playlistUrl }` — `packages/server/src/services/stream-manager.ts`
- [ ] `release(sessionId)`: viewerCount--、0 なら `setTimeout(HLS_IDLE_KILL_MS)` で abort + session dir `rm -rf` — `packages/server/src/services/stream-manager.ts`
- [ ] 再取得時に idle timer を cancel する復帰ロジック — `packages/server/src/services/stream-manager.ts`
- [ ] `process.on('SIGTERM', ...)` で全セッションの `abort()` を await してから exit — `packages/server/src/index.ts` (登録) + `packages/server/src/services/stream-manager.ts` (クリーンアップ処理)
- [ ] 全セグメントが tmpfs 上であることを確認、`-hls_flags delete_segments+append_list+independent_segments` を必ず付ける — `packages/server/src/lib/ffmpeg.ts`

### frontend
- [ ] `useStream(channelId)` フックを作成: `useMutation` で `POST /api/streams/live/:channelId` → state 管理 → unmount 時に `DELETE /api/streams/:sessionId` — `packages/client/src/hooks/useStream.ts`
- [ ] StrictMode の二重実行に備えて sessionId を `useRef` で管理し冪等化
- [ ] `HlsPlayer` コンポーネント (hls.js ラッパー、iOS native 判定、`lowLatencyMode`、MEDIA/NETWORK エラー自動復旧) — `packages/client/src/components/player/HlsPlayer.tsx`
- [ ] `<PlayerControls isLive>` 共有コンポーネントを作成 (再生/停止、ミュート、フルスクリーン、quality picker、±10s skip、rate picker)。`isLive={true}` ではシークバーを `role="progressbar"` (非インタラクティブ) とし、skip / rate は表示するが `aria-disabled="true"` で無効化 (Phase 5 の録画再生で `isLive={false}` 版として再利用) — `packages/client/src/components/player/PlayerControls.tsx`
- [x] `<StatusChip>` プリミティブ実装済 — `packages/client/src/components/shared/status-chip.tsx` (`components/ui/` ではなく `components/shared/` に配置、ユーザー決定 2026-04-17。ui/ は Shadcn 生成物専用)
- [ ] ライブページを作成、`Route.useParams()` で `channelId` を取得 — `packages/client/src/routes/live/$channelId.tsx`
- [ ] `ChannelCard` にライブページ (`/live/$channelId`) への `<Link>` を追加 — `packages/client/src/components/channel/ChannelCard.tsx`
- [ ] `:focus-visible` リングが全操作要素に出ることを確認

### qa
- [ ] 型検査 + Biome
- [ ] コミット単位 (推奨):
  - `feat(streaming): ffmpeg command builder`
  - `feat(streaming): transcoder + stream-manager`
  - `feat(server): streams routes`
  - `feat(client): hls player + live page`

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
