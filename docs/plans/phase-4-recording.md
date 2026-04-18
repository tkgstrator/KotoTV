# Phase 4: 録画

| 項目 | 値 |
|------|-----|
| **目標** | 録画予約の作成・一覧表示・削除が `/recordings` で可能。予約時刻に Mirakc→FFmpeg で録画ファイルを生成 |
| **工数** | 3-4 日 |
| **ステータス** | 実行中 (Mirakc-free パート着手 2026-04-18) |
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

- 採択: **v10** (`docs/mocks/recordings/v10.html`) — sectioned single-column feed (REC NOW / SCHED / FAIL / DONE) + command-palette 予約フォーム
- 詳細: `docs/mocks/recordings/README.md` §Chosen variant
- DONE セクションのみ thumbnail、他は text-dense

## 実行スプリット (2026-04-18)

**Mirakc-free (今回):**
- devops: compose recordings volume + `.env.example` に `RECORDINGS_DIR`
- backend: Prisma schema (Recording + RecordingSchedule) + migration + `Recording.dto.ts` + CRUD routes + SSE events route (subscriber管理だけ、emit 元は streaming 側が後で供給)
- frontend: `useRecordings` / `useRecordingEvents` フック + `RecordingList` + `RecordingScheduleForm` + `/recordings` ルート + SSE 購読

**Mirakc 依存 (後続):**
- streaming: `recording-manager.ts` (起動時 pending 復元 + setTimeout 登録 + Mirakc stream open + FFmpeg spawn)
- `buildRecordArgs()` 純関数 (HLS とは別の `-c copy -f mp4` ベース)
- 録画完了後のサムネ抽出ジョブ (FFmpeg で代表フレーム → SSE push)
- SIGTERM ハンドラ

## 状態遷移 (planner 合意用)

```
RecordingSchedule.status:
  pending → recording → recorded_ts → converting → completed
                     ↘ failed      ↘ convert_failed (再試行可)
  pending → cancelled (before start)

Recording.status: 'scheduled' | 'recording' | 'recorded_ts' | 'converting' | 'completed' | 'failed' | 'convert_failed'
Recording.filePath:
  recording      → .tmp.ts
  recorded_ts    → .ts (一次保存完了、変換待ち)
  converting     → .ts (変換中、別プロセスが書いてる .mp4 は Recording には未反映)
  completed      → .mp4 (変換後、.ts は削除 or 保持 (ユーザー設定))
Recording.thumbnailUrl: string | null   # ← 独立フィールド
```

- サムネイル抽出は録画完了の前進条件にしない。`completed` 遷移は .mp4 変換完了のみで満たし、サムネ生成は非同期の後続ジョブ
- `convert_failed` は .ts を保持したまま失敗状態に遷移し、UI から再試行可能。NVEnc セッション不足などの一時的失敗を想定
- `.ts` を残すか削除するかはユーザー設定 (将来 Phase 6 で追加)、デフォルト削除

## チェックリスト

### planner
- [ ] `RecordingSchedule` / `Recording` の状態遷移 + backend/streaming の責任分担を `docs/plans/phase-4-recording-design.md` (sub doc) に明記
- [ ] スケジューラの実装方針 (node-cron vs 自前 `setTimeout` + DB ポーリング) を選定

### designer ✅ 完了 2026-04-17
- [x] `docs/mocks/recordings/` に v1-v12 バリアント生成
- [x] v10 採択 (sectioned feed + command palette form)
- [x] StatusChip マッピング: `scheduled → sched`, `recording → rec`, `completed → done`, `failed → err`

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

**アーキテクチャ決定 (2026-04-18): TS 先保存 → 後変換 (EPGStation 方式)**

理由:
- コンシューマ GeForce の NVEnc 同時セッション数は Turing/Ampere で 3、Ada で 5-8 と限定的。4 チューナー構成で全録画 + ライブ視聴が重なると枠不足
- 録画中に `-c copy` だけで .ts を書けば NVEnc / QSV を一切消費せず、ライブ視聴側に全エンコード枠を譲れる
- 変換は完了後のバックグラウンドキューで逐次実行すれば HW エンコーダは常に 1 セッションのみ占有
- TS を一次保存しておけば、変換失敗時の再試行・コーデック変更・字幕/ARIB メタ抽出の余地が残る

段階:

1. **録画ステージ (realtime)** — Mirakc TS をそのまま `.ts` ファイルに保存
2. **変換ステージ (background queue)** — 完了後に `.ts` → `.mp4` (AVC/HEVC/VP9) を逐次処理、HW エンコーダ 1 セッションのみ占有

チェックリスト:

- [ ] `recording-manager.ts` を実装: 起動時に `pending` スケジュールをロードし `startAt` で `setTimeout` 登録 — `packages/server/src/services/recording-manager.ts`
- [ ] 予約時刻到達 → Mirakc `openLiveStream(serviceId)` → `Bun.spawn` FFmpeg で **`-c copy -f mpegts` で `.ts` に書き出し** → DB の `Recording` に `filePath` (.ts), `sizeBytes`, `durationSec` を INSERT、status=`recorded_ts`
- [ ] 録画用 FFmpeg コマンドは `buildRecordArgs()` に分離: `-c copy -f mpegts -y <path>.ts`、HW accel 不要 — `packages/server/src/lib/ffmpeg.ts`
- [ ] 録画終了時刻 (`endAt`) で FFmpeg に `q` キー送信または `AbortSignal` で正常終了
- [ ] エラー時は `status='failed'` + `failureReason` に `ffmpeg_exit_<code>` / `mirakc_unreachable` / `disk_full` 等をセット、ログに stderr 保存
- [ ] 録画中は一時拡張子 `.tmp.ts` を使い完走後にリネーム (ファイル破損を避ける)
- [ ] **変換キュー (conversion-queue.ts)** を実装: 同時実行 1 (HW エンコーダ占有回避)、`status=recorded_ts` の録画を `converting` → `completed` に遷移、出力 `.mp4` を `filePath` に更新 — `packages/server/src/services/conversion-queue.ts`
- [ ] 変換用 FFmpeg コマンド `buildConvertArgs({hwAccel, codec, input, output})` を追加: `nvenc` / `qsv` / `vaapi` / `libx264` の分岐 — `packages/server/src/lib/ffmpeg.ts`
- [ ] 変換失敗時は `.ts` を保持したまま `status='convert_failed'` に。UI から再試行可能 (失敗タブに表示)
- [ ] `completed` 遷移後にバックグラウンドでサムネイル抽出ジョブを enqueue: FFmpeg で代表フレーム 1 枚を `data/thumbnails/<recordingId>.jpg` に書き出し、`Recording.thumbnailUrl` を UPDATE → SSE で `thumbnail-ready` を emit。抽出失敗は `thumbnailUrl=null` のまま放置 — `packages/server/src/services/recording-manager.ts`
- [ ] サムネ抽出ジョブは録画本体の FFmpeg プロセスとは分離し、`completed` 遷移自体は抽出完了を待たない
- [ ] CRUD API から新しい予約が追加されたら `setTimeout` を再登録するための event emitter または DB ポーリング (30s 周期)

### frontend
- [x] `useRecordings` フックを作成 (一覧取得・作成・削除の `useQuery`/`useMutation`、`onSuccess` で invalidate) — `packages/client/src/hooks/useRecordings.ts`
- [x] `RecordingScheduleForm` を `react-hook-form` + Zod スキーマで実装 (Shadcn `Form` + `Dialog`) — `packages/client/src/components/recording/RecordingScheduleForm.tsx`
- [x] `RecordingList` コンポーネント (ステータスバッジ、削除ボタン、削除確認 `AlertDialog`) — `packages/client/src/components/recording/RecordingList.tsx`
- [x] 録画一覧ページを作成 — `packages/client/src/routes/recordings.index.tsx` (3 タブ: 予約/進行中/失敗/完了)
- [x] 予約作成・削除の成功/失敗を `sonner` Toast で通知
- [ ] `GET /api/recordings/events` に 1 本の SSE 接続を張り、`thumbnail-ready` 受信時に `queryClient.invalidateQueries({ queryKey: ['recordings'] })`。ポーリングではなく push で更新 — `packages/client/src/hooks/useRecordings.ts` または `packages/client/src/hooks/useRecordingEvents.ts`
- [x] ステータスバッジは Phase 2 で導入した `<StatusChip>` を variant マッピング (`scheduled→sched`, `recording→rec`, `completed→done`, `failed→err`) で再利用 (その後、tab 内で冗長だったため一覧行からは外して section ヘッダー側に集約)
- [ ] サムネ未生成時は Shadcn `Skeleton` を placeholder に表示、`thumbnailUrl` が届いたら差し替え

### qa
- [ ] 型検査 + Biome
- [ ] コミット単位: `feat(server): recording schema + routes`, `feat(streaming): recording manager`, `feat(client): recording UI`

## Changes during execution (〜2026-04-18)

- **完了録画カードに actions menu** (`再生` / `変換` / `削除`) を kebab DropdownMenu で追加、AlertDialog と open 連動
- **pending / failed タブを lg+ で 2 カラムレイアウト**に変更
- **prisma seed にサンプル完了録画を追加** して UI デザイン検証を Mirakc なしで可能に
- **Tab switcher を full width ストレッチ**
- **RecordingList 各行から冗長な StatusChip を除去**、section ヘッダー側に集約
- **予約ボタン (`+ RESERVE` → `+ 予約`) を日本語化**、タブ上部の重複サマリを削除

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

## 追補: ルールベース自動録画

単発予約のパイプラインが着地した後、ルール中心の自動録画機能を追加する。設計は [`phase-4-recording-rules.md`](phase-4-recording-rules.md) 参照。主役はルール、単発予約は副次に降格する方針。
