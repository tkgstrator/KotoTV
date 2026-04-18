# Phase 4: 録画

| 項目 | 値 |
|------|-----|
| **目標** | 録画予約の作成・一覧表示・削除が `/recordings` で可能。予約時刻に Mirakc→FFmpeg で録画ファイルを生成 |
| **工数** | 3-4 日 |
| **ステータス** | 未着手 |
| **前提フェーズ** | Phase 1, Phase 2 |

## 全体フロー

1. `planner` が `recording-manager` のインタフェースと `RecordingSchedule` / `Recording` の状態遷移をドキュメント化 → 合意
2. `designer` が録画一覧 + 予約フォームのモック → 選定
3. `backend` が Prisma 拡張 + `/api/recordings` CRUD
4. `streaming` が `recording-manager.ts` でスケジューラ + FFmpeg 起動ロジック
5. `devops` が `/app/data/recordings` volume を compose に追加
6. `frontend` が採択モックを実装
7. `qa` が型検査 + Biome + コミット

## 採択デザイン

- 候補: `docs/mocks/recordings/v1.html` 他
- 採択: _(未定)_

## 状態遷移 (planner 合意用)

```
RecordingSchedule.status:
  pending → recording → completed
                     ↘ failed
  pending → cancelled (before start)

Recording.status: 'scheduled' | 'recording' | 'completed' | 'failed'
Recording.thumbnailUrl: string | null   # ← 独立フィールド。status の sub-state ではない
```

サムネイル抽出は録画完了の前進条件にしない。`completed` 遷移は録画ファイル書き込み完了のみで満たし、サムネ生成は非同期の後続ジョブ。

## チェックリスト

### planner
- [ ] `RecordingSchedule` / `Recording` の状態遷移 + backend/streaming の責任分担を `docs/plans/phase-4-recording-design.md` (sub doc) に明記
- [ ] スケジューラの実装方針 (node-cron vs 自前 `setTimeout` + DB ポーリング) を選定

### designer
- [ ] `docs/mocks/recordings/` に一覧画面 + 予約フォームのバリアント (リスト vs カレンダー、モーダル vs 別ページ)
- [ ] 状態表示 (pending/recording/completed/failed) のバッジデザイン
- [ ] 削除確認 UI (destructive action 規約)

### devops
- [ ] `compose.yaml` の app サービスに `volumes: [recordings:/app/data/recordings]` と named volume を追加 — `compose.yaml`
- [ ] `.env.example` に `RECORDINGS_DIR=/app/data/recordings` を追記 — `.env.example`

### backend
- [ ] `RecordingSchedule` / `Recording` モデルを Prisma スキーマに追加 — `packages/server/prisma/schema.prisma`
- [ ] `bunx prisma migrate dev --name add-recording` を実行 — `packages/server/prisma/migrations/`
- [ ] `RecordingScheduleSchema` / `RecordingSchema` / `CreateRecordingScheduleSchema` を定義 — `packages/server/src/schemas/Recording.dto.ts`
- [ ] `GET /api/recordings` (一覧)、`POST /api/recordings` (予約作成)、`DELETE /api/recordings/:id` (削除) — `packages/server/src/routes/recordings.ts`
- [ ] 予約作成時に Mirakc クライアント経由で番組存在確認 (past-in-time は 400) — `packages/server/src/routes/recordings.ts`
- [ ] recordings ルートを `app.ts` にマウントし `AppType` を更新 — `packages/server/src/app.ts`
- [ ] `Recording` モデルに `thumbnailUrl String?` フィールドを追加 (status の sub-state ではなく独立カラム) — `packages/server/src/prisma/schema.prisma`
- [ ] `GET /api/recordings/events` を **Global SSE** で実装 (per-recording ストリームは実装しない。決定 2026-04-17)。イベント形式 `{ type: 'thumbnail-ready', recordingId, thumbnailUrl }` / `{ type: 'status-changed', recordingId, status }` ほか将来の状態遷移通知。一覧ページ + 詳細ページ両方がこの 1 本を subscribe し、詳細ページ側で `recordingId === currentId` を filter — `packages/server/src/routes/recordings.ts`
- [ ] SSE ルートのクライアント切断検知 (`c.req.raw.signal`) と in-memory subscriber リストのクリーンアップ

### streaming
- [ ] `recording-manager.ts` を実装: 起動時に `pending` スケジュールをロードし `startAt` で `setTimeout` 登録 — `packages/server/src/services/recording-manager.ts`
- [ ] 予約時刻到達 → Mirakc で `openLiveStream(serviceId)` → `Bun.spawn` FFmpeg で TS→MP4 (or MKV) 保存 → DB の `Recording` に `filePath`, `sizeBytes`, `durationSec` を INSERT
- [ ] 録画用 FFmpeg は HLS とは別コマンド: `-c copy -f mp4 -movflags +faststart` ベース、再エンコード不要 — `packages/server/src/lib/ffmpeg.ts` に `buildRecordArgs()` 追加
- [ ] 録画終了時刻 (`endAt`) で FFmpeg に `q` キー送信または `AbortSignal` で正常終了
- [ ] エラー時は `status='failed'` + ログに stderr を保存
- [ ] `completed` 遷移後にバックグラウンドでサムネイル抽出ジョブを enqueue: FFmpeg で代表フレーム 1 枚を `data/thumbnails/<recordingId>.jpg` に書き出し、`Recording.thumbnailUrl` を UPDATE → SSE で `thumbnail-ready` を emit。抽出失敗は `thumbnailUrl=null` のまま放置 (録画完了自体は成功扱い) — `packages/server/src/services/recording-manager.ts`
- [ ] サムネ抽出ジョブは録画本体の FFmpeg プロセスとは分離し、`completed` 遷移自体は抽出完了を待たない
- [ ] CRUD API から新しい予約が追加されたら `setTimeout` を再登録するための event emitter または DB ポーリング (30s 周期)

### frontend
- [ ] `useRecordings` フックを作成 (一覧取得・作成・削除の `useQuery`/`useMutation`、`onSuccess` で invalidate) — `packages/client/src/hooks/useRecordings.ts`
- [ ] `RecordingScheduleForm` を `react-hook-form` + Zod スキーマで実装 (Shadcn `Form` + `Dialog`) — `packages/client/src/components/recording/RecordingScheduleForm.tsx`
- [ ] `RecordingList` コンポーネント (ステータスバッジ、削除ボタン、削除確認 `AlertDialog`) — `packages/client/src/components/recording/RecordingList.tsx`
- [ ] 録画一覧ページを作成 — `packages/client/src/routes/recordings/index.tsx`
- [ ] 予約作成・削除の成功/失敗を `sonner` Toast で通知
- [ ] `GET /api/recordings/events` に 1 本の SSE 接続を張り、`thumbnail-ready` 受信時に `queryClient.invalidateQueries({ queryKey: ['recordings'] })`。ポーリングではなく push で更新 — `packages/client/src/hooks/useRecordings.ts` または `packages/client/src/hooks/useRecordingEvents.ts`
- [ ] ステータスバッジは Phase 2 で導入した `<StatusChip>` を variant マッピング (`scheduled→sched`, `recording→rec`, `completed→done`, `failed→err`) で再利用。ローカル再実装禁止 — `packages/client/src/components/recording/RecordingList.tsx`
- [ ] サムネ未生成時は Shadcn `Skeleton` を placeholder に表示、`thumbnailUrl` が届いたら差し替え

### qa
- [ ] 型検査 + Biome
- [ ] コミット単位: `feat(server): recording schema + routes`, `feat(streaming): recording manager`, `feat(client): recording UI`

## 共有コントラクト

- **サムネイルパイプライン**: `Recording.thumbnailUrl` は status と独立したフィールド。録画完了 → 非同期でサムネ抽出 → SSE で push という三段構造。クライアントはポーリングではなく SSE 購読で `['recordings']` を invalidate する。
- **`<StatusChip>`**: Phase 2 で導入される共有プリミティブ (variants `sched / rec / done / err` 等)。録画一覧のステータスバッジはこれを使う。詳細は [`docs/mocks/app-shell/README.md`](../mocks/app-shell/README.md) §StatusChip と [`docs/mocks/recordings/README.md`](../mocks/recordings/README.md) (v10)。

## 検証基準

- [ ] pgadmin で `recording_schedules` / `recordings` テーブルが存在する
- [ ] `POST /api/recordings` で予約が DB に保存される
- [ ] 未来の予約時刻到達で FFmpeg が起動し、終了時刻でファイルが生成される
- [ ] 存在しない番組 ID 指定で 404 が返る
- [ ] `DELETE /api/recordings/:id` で DB レコードが削除される (対応する録画ファイルもディスクから削除)
- [ ] サーバ再起動後も `pending` スケジュールが復元されて正しく起動する
- [ ] 録画完了から数秒以内に `thumbnail-ready` SSE イベントが届き、クライアントの一覧サムネが push 更新される (ポーリング依存なし)
- [ ] サムネ抽出失敗時も録画レコード自体は `completed` として成立する

## リスクと緩和策

- **スケジューラの信頼性**: `setTimeout` だけでは再起動に弱い。起動時に DB の `pending` を全ロードして再登録するロジックを必ず入れる。
- **録画ファイル破損**: FFmpeg 異常終了時に壊れた MP4 が残る → `-movflags +faststart` + 録画中は一時拡張子 `.tmp.mp4` を使い完走後にリネーム。
- **タイムゾーン**: `startAt` は UTC unix ms 固定。DB は `timestamptz`。UI 表示時のみローカル時刻に変換。
- **ディスク容量**: `RECORDINGS_DIR` を監視するヘルスチェックエンドポイントを Phase 6 で追加。

## 参照スキル

- `prisma-postgres`、`mirakc`、`ffmpeg-hls`、`bun-hono`、`tanstack-query-best-practices`、`shadcn`
