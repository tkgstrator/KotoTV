# Phase 3: EPG 番組表

| 項目 | 値 |
|------|-----|
| **目標** | `/epg` ページに仮想スクロール対応の番組表グリッドが表示され、番組セルからライブ視聴に遷移できる |
| **工数** | 2-3 日 |
| **ステータス** | 未着手 |
| **前提フェーズ** | Phase 1 |

## 全体フロー

1. `designer` が EPG グリッドのモック 2-3 案 (密度違い、時間軸の向き違い、サイドバー有無など) → 選定
2. `backend` が `GET /api/programs` (Zod `channelId`/`startAt`/`endAt` 必須)
3. `frontend` が `useVirtualizer` (縦横) ベースの `EPGGrid` を実装
4. `qa` が型検査 + Biome + コミット

## 採択デザイン

- 候補: `docs/mocks/epg/v1.html` 他
- 採択: _(未定)_

## チェックリスト

### designer
- [ ] `docs/mocks/epg/` に 2-3 バリアント (縦時刻軸 / 横時刻軸 / ハイブリッド、密度違い)
- [ ] ジャンル色分けのルール表を `README.md` に
- [ ] 現在時刻インジケータの視覚表現案
- [ ] モバイル (単一チャンネル縦スクロール) とデスクトップ (グリッド) で別レイアウトを提示

### backend
- [ ] `ProgramSchema` / `ProgramListResponseSchema` を定義 — `packages/server/src/schemas/Program.dto.ts`
- [ ] Mirakc `GET /api/programs` を呼び出すメソッドを追加 (`channelId`, `startAt`, `endAt` でフィルタ) — `packages/server/src/services/mirakc-client.ts`
- [ ] `GET /api/programs` ルートを実装 (クエリ `channelId`/`startAt`/`endAt` を `zValidator` で必須検証) — `packages/server/src/routes/programs.ts`
- [ ] programs ルートを `app.ts` にマウントし `AppType` を更新 — `packages/server/src/app.ts`
- [ ] レスポンスは時刻順にソートして返す

### frontend
- [ ] `usePrograms` フックを作成 (query key: `["programs", channelId, startAt, endAt]`、`staleTime: 5 * 60_000`) — `packages/client/src/hooks/usePrograms.ts`
- [ ] `EPGGrid` コンポーネントを `@tanstack/react-virtual` で実装 (縦横 2 軸の `useVirtualizer`) — `packages/client/src/components/epg/EPGGrid.tsx`
- [ ] `ProgramCell` コンポーネントを作成 (番組名、時刻、ジャンル色分け、`date-fns` で時刻フォーマット) — `packages/client/src/components/epg/ProgramCell.tsx`
- [ ] 現在時刻インジケータを `useEffect` + `setInterval(60_000)` で自動更新 — `packages/client/src/components/epg/EPGGrid.tsx`
- [ ] NOW-strip (現在時刻 sticky 行) の sticky 位置は CSS 変数 `--shell-offset` (または Tailwind alias `top-shell-offset`) を参照してハードコードしない。値はテーマファイル `packages/client/src/themes/tech.css` が提供。`/live/$id` など player route では shell が `<html data-mode="player">` を設定して自動で 40px に縮退する — `packages/client/src/components/epg/EPGGrid.tsx`
- [ ] `ProgramCell` のジャンル / 録画予約状態バッジは Phase 2 で用意した `<StatusChip>` を再利用 (ローカル再実装禁止) — `packages/client/src/components/epg/ProgramCell.tsx`
- [ ] EPG ページ、search params (`at`, `channel`) を Zod で validate — `packages/client/src/routes/epg.tsx`
- [ ] 番組セル → `/live/$channelId` の `<Link>` — `packages/client/src/components/epg/ProgramCell.tsx`
- [ ] まず非仮想版を作って正確性を確認してから仮想化

### qa
- [ ] 型検査 + Biome
- [ ] コミット: `feat(epg): virtualized program grid`

## 共有コントラクト (参照)

- **`--shell-offset` / レイアウト変数**: テーマファイル (`packages/client/src/themes/tech.css`) が全てのレイアウト次元 (`--shell-offset`, `--now-strip-h`, `--diag-sidebar-w`, `--sidebar-w`, `--container-max` 等) を提供する。EPG は NOW-strip sticky top にこの変数を使うだけ。モード切替 (player ↔ 非 player) は shell が `<html data-mode>` を切り替え、値の分岐はテーマファイル側で完結する。
- **`<StatusChip>`**: Phase 2 で frontend が先に実装する共有プリミティブ。EPG セル内のジャンル / 録画予約状態表示に利用する。

## 検証基準

- [ ] `curl /api/programs?channelId=X&startAt=1715000000000&endAt=1715100000000` が番組配列を返す
- [ ] パラメータ不正時に 400 が返る
- [ ] EPG 画面で全チャンネル×24h のデータでもスクロールが滑らか (60fps 近く)
- [ ] 番組セルクリックで `/live/:channelId` に遷移しライブ再生が始まる
- [ ] 現在時刻インジケータが 1 分ごとに自動更新される
- [ ] スマホ幅 (375px) で崩れない

## リスクと緩和策

- **Mirakc のレスポンス量が重い**: `startAt`/`endAt` を必須にして取得範囲を強制限定。フロント側は 24 時間単位でページング。
- **2 軸 `useVirtualizer` の複雑さ**: まず非仮想版で正しい DOM を作り、視覚的に確認してから段階的に仮想化。縦のみ仮想化 → 横も仮想化の順。
- **モバイルの 2 軸スクロール競合**: `touch-action: pan-y` (モバイル) と `pan-x pan-y` (デスクトップ) を条件分岐。CSS Grid の `overflow` を各軸独立に制御。

## 参照スキル

- `mirakc`、`bun-hono`、`tanstack-router`、`tanstack-query-best-practices`、`shadcn`、`spatial-nav`
