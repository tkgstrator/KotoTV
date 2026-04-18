# Phase 4 追補: ルールベース自動録画 + EPG DB 永続化

| 項目 | 値 |
|------|-----|
| **目標** | ルール (キーワード/ジャンル/チャンネル/時間帯) で `RecordingSchedule` を自動生成。前提として EPG を DB に永続化し、マッチ / プレビューはすべて DB 検索ベースに統一する |
| **工数** | 3-4 日 (EPG DB 化 +1 日分を追加評価) |
| **ステータス** | 実装着手 (2026-04-18) |
| **前提** | Phase 4 本体 (`RecordingSchedule` / `Recording` スキーマ + CRUD + SSE + `/recordings` UI) が着地済み、Phase 3 (EPG fetch) が Mirakc 経由で動作中 |
| **位置付け** | Phase 4 本体の延長。**主役はルール**、単発予約は副次 |

## 方針転換の記録 (2026-04-18)

当初プラン (2026-04-17) では Mirakc 直叩きのまま rule-matcher / preview を実装する方針だったが、以下の理由で **EPG を DB に永続化** する方向に切り替えた:

- ルール評価は 7 日分 × 40 ch = 数千 program を N ルール分ループするため、毎回 Mirakc を叩くと 30 分ごとのマッチでネットワーク負荷が高い
- プレビューは debounce 付きのリアルタイム反映を求められ (ユーザー要望 Q3)、`POST /preview` 相当の応答を DB 検索にすれば数十 ms で返せる
- キーワード検索 (特に regex) は JS 側で全件評価するより Postgres のインデックス + 絞り込みの方が総合的に速い
- Mirakc が一時的に落ちても DB キャッシュがあれば UI が機能し続ける

Open Questions (前回版 §「開発者向けオープン課題」) に対するユーザー最終回答:

- Q1 channelTypes vs channelIds → **`channelIds` のみ**。GR/BS/CS 一括選択は UI 側の展開機能で実現
- Q2 チューナー総数 → **mirakc `/api/status` から動的取得** (env 固定しない)
- Q3 プレビュー → **採用** (サーバ側 `POST /api/recording-rules/preview`、debounce 500ms)
- Q4 skipped UI → **`skipped` 追加せず、`failed` + `failureReason` に統合**
- Q5 name unique → **不要**

## 非ゴール

- mirakc webhook / SSE `/events` による EPG push 購読 (将来 Phase 6+)
- 過去番組 (放送済み) の検索・再ラン (24h 以上経過したら DB から削除)
- ルール単位のクォータ / 課金制御
- regex sandbox (`re2`) 導入 — 入力検証で妥協

## 全体フロー

1. `planner` (これ): 本ドキュメント
2. `designer`: `docs/mocks/recording-rules/` にルール管理 UI 3-5 案 → ユーザー選定
3. `backend`: Prisma に `Program` + `RecordingRule` 追加 / EPG 同期ワーカー / CRUD + preview + matcher
4. `frontend`: `/recordings` を 3 タブ化 + `/recordings/rules` 追加 + チャンネル選択 UI
5. `streaming`: 変更なし (recording-manager は `ruleId` を意識しない)
6. `qa`: 型検査 + Biome + commitlint

## データモデル

### 新規: `Program` (EPG 永続化)

```prisma
model Program {
  id          String   @id                      // Mirakc program id (string)
  channelId   String   @map("channel_id")       // Channel.id と一致 (serviceId を string 化)
  title       String
  description String?
  startAt     DateTime @map("start_at") @db.Timestamptz
  endAt       DateTime @map("end_at")   @db.Timestamptz
  genres      String[] @default([])             // 日本語ジャンル文字列 (ARIB 変換後)
  updatedAt   DateTime @updatedAt @map("updated_at")
  fetchedAt   DateTime @default(now()) @map("fetched_at")

  @@index([channelId, startAt])
  @@index([startAt, endAt])
  @@index([title])
  @@map("programs")
}
```

- `genres` は `packages/server/src/lib/arib-genre.ts` で変換後の日本語配列を格納 (Phase 3 で実装済みの変換器を流用)
- `id` は Mirakc の program id をそのまま主キーに採用 (既存 `ProgramSchema.id` と互換)
- `fetchedAt` は同期周期が回ったかのモニタリング用

### 新規: `RecordingRule`

```prisma
enum RuleKeywordMode {
  literal
  regex
}

enum RuleKeywordTarget {
  title
  title_description
}

model RecordingRule {
  id                String             @id @default(uuid())
  name              String
  enabled           Boolean            @default(true)

  keyword           String?
  keywordMode       RuleKeywordMode    @default(literal) @map("keyword_mode")
  keywordTarget     RuleKeywordTarget  @default(title)   @map("keyword_target")
  excludeKeyword    String?            @map("exclude_keyword")

  // Scope — empty = no restriction
  channelIds        String[]           @default([]) @map("channel_ids")
  genres            String[]           @default([])

  // Schedule filter
  dayOfWeek         Int[]              @default([]) @map("day_of_week")   // 0-6 (Sun-Sat), JST 判定
  timeStartMinutes  Int?               @map("time_start_minutes")         // 0-1439, JST
  timeEndMinutes    Int?               @map("time_end_minutes")           // 0-1439, inclusive, JST

  priority          Int                @default(0)
  avoidDuplicates   Boolean            @default(true) @map("avoid_duplicates")

  createdAt         DateTime           @default(now()) @map("created_at")
  updatedAt         DateTime           @updatedAt      @map("updated_at")

  schedules         RecordingSchedule[]

  @@index([enabled])
  @@map("recording_rules")
}
```

- `channelTypes` は **廃止**。GR/BS/CS 一括は UI 側で serviceId 列挙して `channelIds` に展開する運用
- `timeStart > timeEnd` の日跨ぎ (例 22:00-04:00) は matcher 側で分岐
- `enabled=false` で一時停止 (削除せず残せる)

### 既存 `RecordingSchedule` 拡張

```prisma
model RecordingSchedule {
  // ... 既存フィールド
  ruleId         String?        @map("rule_id")
  failureReason  String?        @map("failure_reason")    // e.g. "tuner_conflict", "ffmpeg_exit_1"
  rule           RecordingRule? @relation(fields: [ruleId], references: [id], onDelete: SetNull)

  @@unique([ruleId, programId])
  @@index([ruleId])
  // 既存 @@index([status, startAt]) は維持
}
```

- `ScheduleStatus` に `skipped` は **追加しない** (Q4 決定)。チューナー不足は `status=failed` + `failureReason='tuner_conflict'`
- `failureReason` は自由形式 string (Zod enum でサーバ側は制約)。FFmpeg 異常終了は `ffmpeg_exit_<code>`、コンフリクトは `tuner_conflict`
- マイグレーション名: `bunx prisma migrate dev --name add-recording-rules-and-programs`

## EPG 同期ワーカー

### 責務

`packages/server/src/services/epg-sync.ts` (新規)

- 起動時に 1 回 + 以後 15 分間隔で `syncAllPrograms()` を実行
- 各チャンネルの programs を Mirakc から取得 → `Program` に UPSERT
- `endAt < now() - 24h` の行を削除 (DB 肥大化防止)
- 失敗は warn ログ + Phase 6 log-buffer に記録、次の周期で再試行
- `setTimeout` の再帰起動で中断可能に。SIGTERM ハンドラで in-flight 同期を `await`

### インタフェース (擬似コード)

```ts
export async function syncAllPrograms(): Promise<{
  upserted: number
  deleted: number
  failedChannels: string[]
}>

export function startEpgSyncScheduler(): void
export function stopEpgSyncScheduler(): Promise<void>  // await in-flight run
```

### 同期アルゴリズム

```
syncAllPrograms():
  channels = mirakcClient.listServices()        // Phase 1 キャッシュ利用
  results = await Promise.allSettled(
    channels.map(c => withConcurrency(4, () => syncChannel(c.id)))
  )
  deleted = await prisma.program.deleteMany({ where: { endAt: { lt: now - 24h } } })
  return summary

syncChannel(channelId):
  programs = mirakcClient.listPrograms(serviceId)  // 既存 API
  for p in programs:
    prisma.program.upsert({
      where: { id: p.id },
      create: { ...mapArib(p) },
      update: { title, description, startAt, endAt, genres, updatedAt, fetchedAt: now }
    })
```

- 並列度は 4 (Mirakc 負荷 + DB コネクション数のバランス)
- UPSERT 単位のトランザクションは行単位で十分 (大きなトランザクションにすると長時間ロックになる)

### 既存コードの影響

- `mirakc-client.listProgramsInRange()`: **消さずにフォールバック化**。メイン経路は DB。同期がまだ回ってない / 直近で失敗している場合のセーフティネット (routes/programs.ts で `Program` が 0 件かつ `fetchedAt` が 5 分以上古いチャンネルは直叩きに fallback)
- `routes/programs.ts` (`GET /api/programs`): 第一次は `prisma.program.findMany({ where: { channelId, startAt: { lt: endAt }, endAt: { gt: startAt } } })` に切替
- `Program.dto.ts` の Zod schema は現状維持。DB 行 → `ProgramSchema` への serialize 関数を追加

## マッチエンジン

### 方式: ハイブリッド (維持)

| トリガー | 頻度 | 対象 |
|----------|------|------|
| サーバ起動時 | 1 回 (EPG 同期完了後) | 全ルール |
| 定期実行 | 30 分おき | 全ルール |
| ルール CUD | 即時 (fire-and-forget) | 対象ルールのみ |
| EPG 同期完了後 | 即時 | 全ルール (新着 program が入った可能性) |

### 実装場所

`packages/server/src/services/rule-matcher.ts` (新規)

### インタフェース

```ts
// Pure predicate — unit test friendly
export function matches(program: ProgramRow, rule: RecordingRule): boolean

// DB-backed orchestrator
export async function runRuleMatcher(options?: {
  ruleIds?: string[]
  sinceMs?: number   // default: now
  untilMs?: number   // default: now + 7d
}): Promise<{ created: number; skipped: number }>

export function startRuleMatcherScheduler(): void
export function stopRuleMatcherScheduler(): Promise<void>
```

### DB クエリベースのフロー

```
runRuleMatcher(ruleIds?):
  rules = prisma.recordingRule.findMany({ where: { enabled: true, id?: ruleIds } })
  for rule in rules:
    // 第一段: DB で粗く絞る (channelIds, genres, 時間帯は where 句)
    candidates = prisma.program.findMany({
      where: {
        startAt: { lt: untilMs }, endAt: { gt: sinceMs },
        channelId: rule.channelIds.length ? { in: rule.channelIds } : undefined,
        genres: rule.genres.length ? { hasSome: rule.genres } : undefined,
        title: rule.keywordMode === 'literal' && rule.keyword
          ? { contains: rule.keyword, mode: 'insensitive' } : undefined
      }
    })
    // 第二段: JS で exclude / regex / dayOfWeek / 時刻窓を評価
    matched = candidates.filter(p => matches(p, rule))
    for p in matched:
      if rule.avoidDuplicates and dedupExists(rule, p.title): skipped++; continue
      INSERT RecordingSchedule ON CONFLICT (rule_id, program_id) DO NOTHING
      if inserted: created++; emitRecordingEvent(...)
  resolveConflicts()   // チューナー上限による failed+reason 降格
```

- `dedupExists(rule, title)`: 同一ルール × 同一 title で既存 `pending`/`recording`/`completed` スケジュールがあれば true
- `ON CONFLICT DO NOTHING`: `@@unique([ruleId, programId])` 依存

### matches() 評価順 (早期 return)

1. `channelIds` (DB where で既に絞ってあるが防御的)
2. `dayOfWeek` / `timeStart..timeEnd` (program.startAt を `Asia/Tokyo` で解釈)
3. `genres` (program.genres ∩ rule.genres が空でない)
4. `excludeKeyword` (title_description 対象。マッチしたら false)
5. `keyword` (literal or regex)

### regex 安全性

- ルール保存時 (`POST` / `PATCH`) に `new RegExp(keyword)` を try/catch → 不正なら 400
- 実行時ガード: `keyword.length <= 200`、`target.length <= 4000`
- re2 等のサンドボックスは Phase 外

## プレビュー

### `POST /api/recording-rules/preview`

- **未保存のルール定義** を body に載せて送信 (新規作成画面からも使える)
- サーバで DB を検索 → matches() で filter → 結果を返す
- frontend は debounce 500ms で叩く

```ts
Request: CreateRecordingRuleSchema.extend({
  windowHours: z.number().int().min(1).max(168).default(24),
  limit: z.number().int().min(1).max(200).default(50)
})

Response: z.object({
  matchCount: z.number().int().nonnegative(),
  programs: z.array(ProgramSummarySchema)     // { id, title, startAt, endAt, channelId, channelName }
})
```

- matches() を API と scheduler で共有 → プレビュー結果と実マッチの整合性を保証
- `windowHours` のデフォルト 24 はユーザー要望 (「24 時間で何件ヒット」) に合わせる

## コンフリクト解決

### ルール間 (同一 program が複数ルールにヒット)

- `priority` 降順で先着のルールが ruleId を取得
- program 単位の `@@unique` は入れない (手動予約との並列を許容)

### チューナー数上限

- mirakc `/api/status` を Phase 1 の `mirakc-client` に新メソッド追加して取得 (キャッシュ 60s)
  - レスポンスのうち `tuners[].isAvailable === true` の件数を総数とする
- `resolveConflicts()` 実装:
  - 時間帯重複する `pending` スケジュールをグループ化
  - グループ内 priority 降順 → 先頭 N 件を `pending` のまま、残りは `status='failed'` + `failureReason='tuner_conflict'`
  - 手動予約 (ruleId = null) は priority=+∞ 扱いで常に優先

### チューナー数取得のフォールバック

- mirakc unreachable 時は `tuners_total` を **直近成功値をキャッシュして使用**、それも無ければデフォルト 2
- キャッシュは `packages/server/src/services/mirakc-client.ts` の内部 `let cachedTunerTotal: { value: number; at: number } | null`

## UI サーフェス

### `/recordings` を **3 タブ構成**

```
[録画待ち 12] [完了 48] [失敗 3]   [+ 手動予約] [⚙ ルール管理]
```

- `/recordings?tab=pending`: ルール由来 + 手動の `pending`/`recording`。ルール由来はバッジ (ルール名)
- `/recordings?tab=completed`: `completed`
- `/recordings?tab=failed`: `failed` (チューナー不足 skipped 相当も含む)。`failureReason` を二次行で表示 (例: "チューナー不足でスキップされました")

### 別ルート `/recordings/rules/*`

- `/recordings/rules` 一覧 + 新規作成ボタン
- `/recordings/rules/new` 新規作成 (編集と同コンポーネント)
- `/recordings/rules/$ruleId` 編集 + プレビュー右ペイン (debounce 500ms)

### チャンネル選択 UI

- [GR すべて] [BS すべて] [CS すべて] ボタン → 該当 type の serviceId を `channelIds` に一括展開
- 個別チェックボックス (ポチポチ外し可能)
- 「GR すべて」を押した後で 1 ch を外すと、次回 GR 追加時は union の挙動 (既存選択は保持)

### モック依頼

`designer` に `docs/mocks/recording-rules/` で以下を要望:

- ルール一覧 (空状態 + 数件ある状態) 3-5 案
- ルール編集 (フォーム + プレビュー配置) 3-5 案
- チャンネル選択 UI の密度違い (一括ボタン + チェックボックス群)

## API コントラクト

### EPG 同期は内部 (API 無し)

### `GET /api/recording-rules`

```ts
Response: { rules: RecordingRule[] }
```

### `POST /api/recording-rules`

```ts
Request: CreateRecordingRuleSchema
Response: RecordingRule (201)
```

- 作成後に `runRuleMatcher({ ruleIds: [newId] })` を fire-and-forget

### `GET /api/recording-rules/:id`

### `PATCH /api/recording-rules/:id`

- 同じく fire-and-forget で matcher 再実行

### `DELETE /api/recording-rules/:id`

- 紐づくスケジュールは残す (ruleId は SetNull で手動予約相当に降格)

### `POST /api/recording-rules/preview`

(上記プレビュー節参照)

### Zod 追記先

`packages/server/src/schemas/RecordingRule.dto.ts` (新規):
- `RuleKeywordModeSchema`, `RuleKeywordTargetSchema`
- `RecordingRuleSchema`, `CreateRecordingRuleSchema`, `UpdateRecordingRuleSchema`
- `PreviewRecordingRuleRequestSchema`, `PreviewRecordingRuleResponseSchema`
- `ProgramSummarySchema`

`packages/server/src/schemas/Recording.dto.ts` の `RecordingEventSchema` に追加:
- `{ type: 'rule-matched', ruleId, createdCount }`
- `{ type: 'epg-synced', upserted, deleted }` (任意。UI の "最終同期" 表示に使える)

### Failure reason の標準化

`packages/server/src/schemas/Recording.dto.ts` に:

```ts
export const FailureReasonSchema = z.enum([
  'tuner_conflict',
  'ffmpeg_exit',
  'mirakc_unreachable',
  'disk_full',
  'other'
])
```

- 実際は文字列で保存するが、返却時に enum 一致を試みて UI の表示制御に使う

## チェックリスト

### planner
- [x] 本ドキュメント
- [ ] `docs/mocks/recording-rules/README.md` 骨子 (designer 向け依頼)
- [ ] `docs/plans/phase-3-epg.md` 末尾に Phase 4-rules 追補参照を追加

### backend (EPG 永続化)
- [ ] Prisma schema に `Program` モデル追加 — `packages/server/prisma/schema.prisma`
- [ ] `epg-sync.ts` 実装 (`syncAllPrograms`, `syncChannel`, scheduler) — `packages/server/src/services/epg-sync.ts`
- [ ] サーバ起動時 `startEpgSyncScheduler()` + SIGTERM で `stopEpgSyncScheduler()` を await — `packages/server/src/index.ts`
- [ ] `routes/programs.ts` を DB クエリベースに切替 + Mirakc フォールバック実装
- [ ] `mirakc-client.ts` に `getStatus()` (tuner 総数取得 + キャッシュ) 追加
- [ ] Program row → `ProgramSchema` serializer を `packages/server/src/schemas/Program.dto.ts` に追加

### backend (rule エンジン)
- [ ] Prisma schema に `RecordingRule` + enum 2 種 + `RecordingSchedule.ruleId` + `RecordingSchedule.failureReason` 追加
- [ ] `bunx prisma migrate dev --name add-recording-rules-and-programs`
- [ ] `RecordingRule.dto.ts` に Zod スキーマ群 — `packages/server/src/schemas/RecordingRule.dto.ts`
- [ ] `Recording.dto.ts` に `rule-matched` / `epg-synced` event + `FailureReasonSchema` 追加
- [ ] `/api/recording-rules` CRUD + `/preview` 実装 — `packages/server/src/routes/recording-rules.ts`
- [ ] `app.ts` にマウント + `AppType` 更新
- [ ] `rule-matcher.ts`: `matches()` 純関数 + `runRuleMatcher()` + `resolveConflicts()` + scheduler
- [ ] サーバ起動時 EPG 初回同期完了 → `runRuleMatcher()` → `startRuleMatcherScheduler()` のシーケンス
- [ ] regex keyword 保存時バリデーション (`new RegExp()` try/catch)
- [ ] 単体テスト: `matches()` の真偽表 (keyword / genre / channel / time / dayOfWeek / exclude / 日跨ぎ)
- [ ] 単体テスト: `resolveConflicts()` (tuner_total=2 で 3 本重複 → 低優先度 1 本が failed)

### frontend
- [ ] `useRecordingRules` / `useCreateRecordingRule` / `useUpdateRecordingRule` / `useDeleteRecordingRule` — `packages/client/src/hooks/useRecordingRules.ts`
- [ ] `useRecordingRulePreview` (debounce 500ms の mutation) — 同上
- [ ] `/recordings` を 3 タブ化 (`?tab=pending|completed|failed`) — `packages/client/src/routes/recordings/index.tsx`
- [ ] 失敗タブで `failureReason` の日本語表示 (tuner_conflict → "チューナー不足")
- [ ] `/recordings/rules` 一覧 — `packages/client/src/routes/recordings/rules/index.tsx`
- [ ] `/recordings/rules/$ruleId` 編集 — `packages/client/src/routes/recordings/rules/$ruleId.tsx`
- [ ] `/recordings/rules/new` — `packages/client/src/routes/recordings/rules/new.tsx`
- [ ] `RecordingRuleForm` (Shadcn Form + Switch + MultiSelect + Slider for time) — `packages/client/src/components/recording/RecordingRuleForm.tsx`
- [ ] `RecordingRuleList` — `packages/client/src/components/recording/RecordingRuleList.tsx`
- [ ] `RecordingRulePreview` (プレビューペイン + matchCount バッジ) — `packages/client/src/components/recording/RecordingRulePreview.tsx`
- [ ] `ChannelPicker` (GR/BS/CS 一括ボタン + チェックボックス群) — `packages/client/src/components/recording/ChannelPicker.tsx`
- [ ] SSE の `rule-matched` / `epg-synced` 受信で適切に invalidate
- [ ] ルール削除確認 `AlertDialog` (紐づく pending スケジュール件数を表示)

### streaming
- [ ] 変更なし (recording-manager は `ruleId` / `failureReason` を意識しない。ただし FFmpeg 異常終了時に `failureReason='ffmpeg_exit_<code>'` を書き込む 1 行追加はあってよい)

### qa
- [ ] 型検査 + Biome clean
- [ ] コミット単位 (推奨):
  - `feat(server): persist EPG to DB via epg-sync worker`
  - `feat(server): programs route backed by DB with mirakc fallback`
  - `feat(server): recording-rule schema + matcher + conflict resolver`
  - `feat(server): recording-rule routes + preview`
  - `feat(client): /recordings 3-tab + failure reason display`
  - `feat(client): /recordings/rules UI + preview`

**チェックリスト項目合計: 46**

## 検証基準

- [ ] サーバ起動後 15 分以内に `programs` テーブルが全チャンネル分で埋まる
- [ ] Mirakc を停止しても `/api/programs` は DB 値で 200 を返す
- [ ] `endAt < now - 24h` の行が 15 分周期の中で削除される
- [ ] ルール作成後、数秒以内にマッチ番組が `pending` として登録される
- [ ] ルール編集後、プレビュー結果と実マッチの件数が一致 (ソート差異のみ)
- [ ] `excludeKeyword` にヒットする番組は登録されない
- [ ] 日跨ぎ時間帯 (22:00-04:00) が JST で正しく判定される
- [ ] 同一ルール × 同一番組の二重登録が `@@unique` で弾かれる
- [ ] チューナー総数 < 同時刻スケジュール数 のとき、低優先度が `failed` + `failureReason='tuner_conflict'` になる
- [ ] mirakc `/api/status` が落ちたときもキャッシュ値で conflict resolver が動く
- [ ] 手動予約とルール予約が同時刻競合時、手動予約が勝つ
- [ ] regex keyword に不正パターン (`[` 等) を保存しようとすると 400
- [ ] ルール削除後、紐づいていたスケジュールは残り `ruleId` が null
- [ ] `/recordings` の 3 タブの件数バッジが SSE 受信で更新される
- [ ] 失敗タブで `failureReason` が日本語化されて表示される
- [ ] プレビュー (POST /preview) が debounce 500ms で 100 ms 以内に応答する (ローカル DB 前提)

## リスクと緩和策

### EPG DB 化で新たに発生するリスク

- **DB 肥大化**: 40 ch × 7 日分 ≈ 数万行 + JST の頻繁な更新で UPSERT 負荷増。24h 超過の自動削除 + `(channelId, startAt)` index でクエリコストを抑制。行数が 10 万を超えたら監視 (Phase 6)
- **同期失敗時のデータ鮮度**: 全チャンネル並列失敗だと UI が古い EPG で動き続ける。`fetchedAt` が 30 分以上前なら UI に「EPG 更新が遅れています」バナー (Phase 6)。routes/programs.ts で当該チャンネルのみ Mirakc 直叩きに一時フォールバック
- **EPG 同期とマッチャの競合**: 同期の UPSERT 中にマッチャが同じ program を SELECT すると MVCC により古い値を読む可能性。実害は次周期で解決するため許容
- **タイムゾーン混線**: `startAt` は UTC で DB 保存、`dayOfWeek` / `timeStartMinutes` は JST 判定。`Asia/Tokyo` で一貫させる共通ユーティリティを `packages/server/src/lib/timezone.ts` に新設

### 既存リスク (前回版から継承)

- **マッチエンジン O(N×M) 爆発**: DB の where 句で先に絞るので JS 評価は数百行程度。100 ルール × 10k programs でも数百 ms
- **regex ReDoS**: 入力長制限 + 保存時構文チェック
- **mirakc 並列 listPrograms の負荷**: 並列度 4 に制限
- **マイグレーション時の既存 `RecordingSchedule`**: `ruleId` / `failureReason` は nullable 追加で破壊なし

## 開発者向けオープン課題

すべてユーザー確定 (2026-04-18)。残課題なし。実装開始可能。

## 実装開始前の確認推奨事項

- **Q-A. 15 分周期の妥当性**: Mirakc の EPG 更新頻度は現場次第 (地上波は数時間おき、BS は日単位)。15 分は保守的だが、本番で負荷が気になれば 30 分に後退しても実害は小さい
- **Q-B. `Asia/Tokyo` 固定の是非**: ユーザー環境は常に JST 前提で設計しているが、Docker コンテナの `TZ` が未設定だと `dayOfWeek` 判定がズレる。`.env.example` に `TZ=Asia/Tokyo` を追加する旨を devops に依頼すべきか
- **Q-C. `failureReason` のスキーマ**: enum 化 (DB レベル) せず string にしたが、将来 enum 化したくなったときのマイグレーションコストを避けたければ初手から Prisma `enum FailureReason` でも可。現状は string + Zod enum 検証でバランスを取っている

## 参照スキル

- `prisma-postgres` — `Program` / `RecordingRule` モデル追加、マイグレーション
- `bun-hono` — `/api/recording-rules` ルート、`zValidator`
- `mirakc` — `/api/status` 取得、`/api/programs` の既存利用
- `tanstack-query-best-practices` — preview debounce、タブ件数 invalidate
- `tanstack-router` — `/recordings?tab=`、`/recordings/rules/*` 追加
- `shadcn` — Form / Switch / MultiSelect / Slider / AlertDialog

## 関連ドキュメント

- 親: [`phase-4-recording.md`](phase-4-recording.md) (単発予約 + recording-manager)
- EPG 前提: [`phase-3-epg.md`](phase-3-epg.md) — Phase 4-rules でデータソースを Mirakc 直叩きから DB に移行
- モック: `docs/mocks/recording-rules/` (designer が後続で起票)
