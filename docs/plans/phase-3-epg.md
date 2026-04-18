# Phase 3: EPG 番組表

| 項目 | 値 |
|------|-----|
| **目標** | `/epg` ページに仮想スクロール対応の番組表グリッドが表示され、番組セルからライブ視聴に遷移できる |
| **工数** | 2-3 日 |
| **ステータス** | 完了 (2026-04-18)。実 Mirakc 接続後に 40+ ch 60fps 検証を再確認 |
| **前提フェーズ** | Phase 1 |

## 全体フロー

1. `designer` が EPG グリッドのモック 2-3 案 (密度違い、時間軸の向き違い、サイドバー有無など) → 選定
2. `backend` が `GET /api/programs` (Zod `channelId`/`startAt`/`endAt` 必須)
3. `frontend` が `useVirtualizer` (縦横) ベースの `EPGGrid` を実装
4. `qa` が型検査 + Biome + コミット

## 採択デザイン

- 採択: **v4** (`docs/mocks/epg/v4.html`) — pinned NOW-strip + scrollable future grid
- 詳細: `docs/mocks/epg/README.md` §Chosen variant
- モバイル `<md` は v3 アジェンダ風フォールバック

## チェックリスト

### designer ✅ 完了 2026-04-17
- [x] `docs/mocks/epg/` に v1-v8 バリアント生成
- [x] v4 採択 (pinned NOW-strip + future grid)
- [x] モバイル / デスクトップのレイアウト両方提示

### backend ✅ 完了
- [x] `ProgramSchema` / `ProgramListResponseSchema` を定義 — `packages/server/src/schemas/Program.dto.ts`
- [x] Mirakc `GET /api/programs` を呼び出すメソッドを追加 (`channelId`, `startAt`, `endAt` でフィルタ) — `packages/server/src/services/mirakc-client.ts` (`listProgramsInRange`)
- [x] `GET /api/programs` ルートを実装 (クエリ `channelId`/`startAt`/`endAt` を `zValidator` で必須検証、`endAt > startAt` 検証含む) — `packages/server/src/routes/programs.ts`
- [x] programs ルートを `app.ts` にマウントし `AppType` を更新 — `packages/server/src/app.ts`
- [x] レスポンスは時刻順にソートして返す
- [x] ARIB ジャンルコード → 日本語文字列変換 table 追加 — `packages/server/src/lib/arib-genre.ts`

### frontend ✅ 完了
- [x] `usePrograms` フックを作成 (query key: `["programs", channelId, startAt, endAt]`、`staleTime: 5 * 60_000`) — `packages/client/src/hooks/usePrograms.ts`
- [x] `EPGGrid` コンポーネントを `@tanstack/react-virtual` で実装 (縦方向仮想化、横方向はセル絶対配置で DOM 数が既に少ないため非仮想) — `packages/client/src/components/epg/EPGGrid.tsx`
- [x] `ProgramCell` コンポーネントを作成 (番組名、時刻、ジャンル色分け、`date-fns` で時刻フォーマット) — `packages/client/src/components/epg/ProgramCell.tsx`
- [x] 現在時刻インジケータは `useClock()` 共有フック (1s tick、Phase 2 で追加) 経由で自動更新 — `packages/client/src/components/epg/EPGGrid.tsx`
- [x] NOW-strip は削除 (情報はグリッド 1 列目と重複、2026-04-18 ユーザー判断)。shell-offset は全ルート不変の contract に準拠
- [x] `ProgramCell` のジャンル / 録画予約状態バッジは `<StatusChip>` を再利用 — `packages/client/src/components/epg/ProgramCell.tsx`
- [x] EPG ページ、search params (`at`, `channel`, `type`) を検証 — `packages/client/src/routes/epg.tsx`
- [x] 番組セル → `/live/$channelId` の `<Link>` — `packages/client/src/components/epg/ProgramCell.tsx`
- [x] GR/BS/CS フィルタタブ (`?type=` 反映) — `packages/client/src/routes/epg.tsx`
- [x] モバイル: チャンネルクイックジャンプストリップ (IntersectionObserver で active 追従、キーボード矢印対応) — `EPGGrid` 内 `ChannelChipStrip`
- [x] 非仮想版→仮想版の段階的実装 (commit 履歴上も分離)

### qa ✅ 完了
- [x] 型検査 + Biome clean
- [x] コミット (実績):
  - `71eb92b` (bundled with rename) feat(server): programs route + feat(client): /epg page
  - `329e065 perf(epg): virtualise channel rows + mobile channel-jump chip strip`
  - `0e7fe0c ui(epg): drop NOW-strip + enlarge grid cells`
  - `e534239 ui(epg): align PageHeader items + tighten LIVE chip gap`
  - `f2469d0 feat(epg): GR/BS/CS filter tabs`

## 共有コントラクト (参照)

- **`--shell-offset` / レイアウト変数**: テーマファイル (`packages/client/src/themes/tech.css`) が全てのレイアウト次元 (`--shell-offset`, `--now-strip-h`, `--diag-sidebar-w`, `--sidebar-w`, `--container-max` 等) を提供する。EPG は NOW-strip sticky top にこの変数を使うだけ。shell chrome は全ルートで不変 (プレイヤーページでも縮退しない、決定 2026-04-17)。
- **`<StatusChip>`**: Phase 2 で frontend が先に実装する共有プリミティブ。EPG セル内のジャンル / 録画予約状態表示に利用する。

## 検証基準

- [x] `curl /api/programs?channelId=X&startAt=...&endAt=...` が番組配列を返す (`curl "http://localhost:11575/api/programs?channelId=1024&startAt=2026-04-18T12:00:00.000Z&endAt=2026-04-18T14:00:00.000Z"` で確認、Mirakc 未稼働時は mock fallback で動作)
- [x] パラメータ不正時に 400 が返る (zValidator)
- [x] EPG 画面で全チャンネル×8h のデータで仮想化済み (DOM 行数はビューポート高に比例、40ch でもバウンド内)。実 40+ ch + 24h の 60fps 検証は実 Mirakc データ接続後
- [x] 番組セルクリックで `/live/:channelId` に遷移 (Phase 2 の stub で loading 表示まで確認)
- [x] 現在時刻インジケータが自動更新 (`useClock` 1s tick、分境界更新)
- [x] スマホ幅 (375px) で崩れない (v3 アジェンダ+チャンネルチップストリップで対応)

## リスクと緩和策

- **Mirakc のレスポンス量が重い**: `startAt`/`endAt` を必須にして取得範囲を強制限定。フロント側は 24 時間単位でページング。
- **2 軸 `useVirtualizer` の複雑さ**: まず非仮想版で正しい DOM を作り、視覚的に確認してから段階的に仮想化。縦のみ仮想化 → 横も仮想化の順。
- **モバイルの 2 軸スクロール競合**: `touch-action: pan-y` (モバイル) と `pan-x pan-y` (デスクトップ) を条件分岐。CSS Grid の `overflow` を各軸独立に制御。

## 参照スキル

- `mirakc`、`bun-hono`、`tanstack-router`、`tanstack-query-best-practices`、`shadcn`、`spatial-nav`
