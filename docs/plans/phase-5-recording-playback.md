# Phase 5: 録画視聴

| 項目 | 値 |
|------|-----|
| **目標** | `/recordings/:id` で録画ファイルがシーク対応の HLS 再生で視聴できる |
| **工数** | 1-2 日 |
| **ステータス** | 完了 (2026-04-24) |
| **前提フェーズ** | Phase 2, Phase 4 |

## 全体フロー

1. `designer` が録画視聴画面のモック (ライブとの差分: シークバー、チャプター候補) を提示 → 選定
2. `streaming` が録画ファイル用の HLS セッション (`-ss`/`-to` でシーク対応) を追加
3. `backend` が `POST /api/streams/recording/:recordingId` ルートを追加
4. `frontend` が `useStream` を live/recording 兼用に拡張、`/recordings/$id` ページ
5. `qa` が型検査 + Biome + コミット

## 採択デザイン

- 採択: **v12** (`docs/mocks/recording-player/v12.html`) — inline-above-seek identity strip + collapsed fault log + auto-resume toast
- 詳細: `docs/mocks/recording-player/README.md` §Chosen variant

## 実行スプリット (2026-04-18)

**Mirakc-free (今回):**
- backend: `POST /api/streams/recording/:recordingId` stub、`GET /api/recordings/:id` 単体取得ルート
- frontend: `/recordings/$id` ルート + recording-player v12 UI、`<PlayerControls isLive={false}>`、SeekbarChapters、resume chip、fault log collapsible、RecordingList から `<Link>` で導線

**Mirakc-dep (後続):**
- streaming: `acquireRecording()` + `buildRecordingHlsArgs()` (VOD HLS、`-hls_playlist_type vod` + `-hls_list_size 0`)
- 録画ファイル → HLS transcode の実配信
- 実在録画ファイルが DB にある状態での動作確認

## チェックリスト

### designer ✅ 完了 2026-04-17
- [x] `docs/mocks/recording-player/` に v1-v5 legacy + v10-v12 diagnostic-dense バリアント生成
- [x] v12 採択 (inline strip + collapsed fault log)

### backend
- [x] `POST /api/streams/recording/:recordingId` ルートを実装 (stream-manager に委譲) — `packages/server/src/routes/streams.ts`
- [x] `recordingId` から DB 経由で `filePath` を取得して streaming 層に渡す — `packages/server/src/services/recording-service.ts` (新設)
- [x] `AppType` 更新 — `packages/server/src/app.ts`

### streaming
- [x] `acquireRecording(recordingId, filePath)` メソッドを `streamManager` に追加 — `packages/server/src/services/stream-manager.ts`
- [x] 録画用 FFmpeg コマンドを追加: 入力 `-i <filePath>` + HLS 出力 + シーク対応 (`-ss` を使わずリクエストごとに再生成せず、セグメントは全時間分を一気に生成して playlist を `EVENT` タイプに) — `packages/server/src/lib/ffmpeg.ts` に `buildRecordingHlsArgs()` 追加
- [x] 録画再生は live とは異なり `-hls_playlist_type vod` + `-hls_list_size 0` で VOD 配信

### frontend
- [x] `useStream` フックを拡張: `{ type: 'live'; channelId } | { type: 'recording'; recordingId }` のユニオン型 — `packages/client/src/hooks/useStream.ts`
- [x] 録画視聴ページを作成、`HlsPlayer` を `lowLatency={false}` で再利用 — `packages/client/src/routes/recordings/$id.tsx`
- [x] Phase 2 で実装した `<PlayerControls>` を `isLive={false}` で再利用。差分はシークバーが `role="slider"` となってインタラクティブになる点と、チャプター tick オーバーレイを seekbar 上に追加する点のみ (コンポーネント複製は禁止) — `packages/client/src/components/player/PlayerControls.tsx` (拡張), `packages/client/src/components/player/SeekbarChapters.tsx` (新設)
- [x] `<StatusChip>` を再利用して録画メタ表示 (完了時刻、長さ、解像度など) のラベルに使用
- [x] 録画一覧の各アイテムに `<Link to="/recordings/$id" params={{ id }}>` を追加 — `packages/client/src/components/recording/RecordingList.tsx`

### qa
- [x] 型検査 + Biome
- [x] コミット: `feat(streaming): recording playback`, `feat(client): recording player page`

## 共有コントラクト (参照)

- **`<PlayerControls isLive>`**: Phase 2 で `isLive={true}` として build 済み。Phase 5 では同じコンポーネントを `isLive={false}` で使い、差分はシークバー role 切替 (`progressbar` → `slider`) とチャプター tick オーバーレイ追加のみ。ファイル: `packages/client/src/components/player/PlayerControls.tsx`。
- **`<StatusChip>`**: Phase 2 で導入済みの共有プリミティブ。録画プレイヤー画面内のメタデータバッジに再利用する。

## 検証基準

- [ ] 録画一覧から視聴リンクをクリックすると映像が再生される
- [ ] シークバー操作で任意の位置から再生できる (VOD プレイリストなので全セグメント存在)
- [ ] ページ離脱でセッションが停止し HLS dir が削除される
- [ ] 同じ録画を複数タブで開いてもプロセス共有される

## リスクと緩和策

- **`useStream` をユニオン型化するリファクタ**: ライブが壊れないよう、Phase 2 で動作確認したライブ再生の手動テストを必ず実施。型引数で分岐を明確にする。
- **録画ファイルの全セグメント生成時間**: 2 時間番組 → 数秒〜十数秒。ユーザーには「準備中…」を出し、Playlist が `#EXT-X-ENDLIST` を含むまでプレイヤーを mount しない。
- **VOD HLS の disk spike**: tmpfs 512M を超える可能性。録画再生専用に disk-backed HLS dir (`HLS_RECORDING_DIR`) を分ける。

## 参照スキル

- `ffmpeg-hls`、`hls-player`、`bun-hono`
