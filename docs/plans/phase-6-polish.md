# Phase 6: 品質改善

| 項目 | 値 |
|------|-----|
| **目標** | エラー統一・レスポンシブ・Docker 最適化・HLS クリーンアップでリリース品質に到達 |
| **工数** | 2-3 日 |
| **ステータス** | 未着手 |
| **前提フェーズ** | Phase 0〜5 |

## 全体フロー

横断的な改善なので特定の designer フローは不要。各エージェントが自分のレイヤーを磨き込む。

## チェックリスト

### backend
- [ ] グローバルエラーハンドラを `{ error: { code, message } }` 形式に統一し全ルートで一貫 — `packages/server/src/app.ts`
- [ ] `pino` の `requestId` を全ログエントリに付与するミドルウェアを確認 — `packages/server/src/app.ts`
- [ ] `config.ts` の Zod スキーマを整理 — `packages/server/src/lib/config.ts`
- [ ] 全ルートのレスポンス型を `satisfies ResponseSchema` で明示化 — `packages/server/src/routes/*.ts`
- [ ] `GET /api/health` を追加。レスポンス形式: `{ mirakc, postgres, ffmpeg, tuners, disk }` の各フィールドが `{ status: 'ok' | 'warn' | 'err', detail: string }`。app-shell サマリと settings status tab の両方が同じ query key `['health']` で consume するため、形式を先に固定する — `packages/server/src/routes/status.ts`
- [ ] `GET /api/health/logs?subsystem=<name>` を追加 (決定 2026-04-17)。各サブシステム (mirakc / postgres / ffmpeg / tuners) ごとに pino log の **直近 100 行 ring-buffer** を持ち、subsystem クエリで返す。settings status tab の WARN/ERR 時 log-tail drawer が consume — `packages/server/src/routes/status.ts` + `packages/server/src/lib/log-buffer.ts`
- [ ] `disk` フィールドを directory breakdown 対応に拡張 (決定 2026-04-17)。レスポンス shape: `disk: { status, detail, breakdown: { recordings: bytes, hlsTmpfs: bytes, free: bytes, total: bytes } }`。`recordings` は `SUM(size_bytes)` on `Recording` テーブル、`hlsTmpfs` は tmpfs マウントの `statvfs`、`free`/`total` は data disk の `statvfs`。`du` 走査は使わない — `packages/server/src/routes/status.ts`

### streaming
- [ ] 起動時に `HLS_DIR` 配下の孤児セッションディレクトリを削除 (サーバ再起動で残留した tmpfs は実際は消えるが、disk 配置に切り替えた場合の保険) — `packages/server/src/services/stream-manager.ts`
- [ ] `HLS_DIR` の合計サイズを定期ポーリング (60s)、閾値超過で warn ログ — `packages/server/src/services/stream-manager.ts`
- [ ] zombie プロセス検出 (`Bun.spawn` の `proc.exited` が resolved なのに Map に残っているセッション) → 自動クリーンアップ

### frontend
- [ ] settings status tab で WARN/ERR が出ている subsystem をタップすると `GET /api/health/logs?subsystem=<name>` を叩いて直近 100 行を Shadcn `Collapsible` に inline 表示する drawer を実装 — `packages/client/src/components/settings/HealthLogTail.tsx`
- [ ] 全 `useQuery` / `useMutation` のエラーを `sonner` Toast に統一するグローバルハンドラを設定 (`QueryClient` の `defaultOptions`) — `packages/client/src/main.tsx`
- [ ] モバイル・タブレット・デスクトップのブレークポイント対応 (Tailwind `sm:` / `md:` / `lg:`) — `packages/client/src/components/**`
- [ ] `ChannelList` / `EPGGrid` / `RecordingList` のローディング・空状態・エラー状態を Shadcn `Skeleton` / `Alert` で整備
- [ ] キーボードフォーカス順序とリモコン操作を意識した DOM 順序の見直し (`tabIndex`、`aria-label`) — `packages/client/src/components/player/PlayerControls.tsx` 他
- [ ] テーマ切替 (light/dark/system) が全画面で期待通り動くか確認
- [ ] `useHealth` フック: query key `['health']`、`refetchInterval: 15_000`、`refetchIntervalInBackground: false` (document hidden 時はポーリング停止)。app-shell のヘルスサマリと settings status tab が同じフックを共有 (フェッチ 1 本) — `packages/client/src/hooks/useHealth.ts`
- [ ] shell chrome (HealthBar 32px + NavBar 40px = 72px) は **全ルートで不変** (決定 2026-04-17)。プレイヤーページでも縮退しない — ナビゲーション時のレイアウトジャンプ防止 + 視聴中も診断情報を維持 — `packages/client/src/components/shell/AppShell.tsx`
- [ ] app-shell ヘルスチップと settings status tab のバッジは `<StatusChip>` (Phase 2 導入) を再利用

### devops
- [ ] Dockerfile の runtime image slim 化: multi-stage の `--from=deps` / `--from=client-build` を精査、不要な `node_modules` を含めない — `Dockerfile`
- [ ] `.dockerignore` を整備 (`**/node_modules`、`.git`、`data/`、`*.md`) — `.dockerignore`
- [ ] CI で Docker build を検証するジョブを追加 (`docker buildx build --target runtime`) — `.github/workflows/ci.yml`
- [ ] HW accel バリアント毎のタグで GHCR に push するワークフローを追加 (optional) — `.github/workflows/release.yml`

### qa
- [ ] `bunx biome check .` が全 workspace で clean
- [ ] 各 workspace の `typecheck` がエラーゼロ
- [ ] コミット単位で logical に分割: `refactor(server): unify error response`, `ui(client): responsive breakpoints`, `perf(streaming): hls dir monitoring`, `build(docker): slim runtime image`

## 検証基準

- [ ] スマートフォン幅 (375px) でチャンネル一覧 / プレイヤー / 番組表が崩れずに表示される
- [ ] API エラー時に全画面で Toast が表示される
- [ ] キーボードのみで全機能が操作できる (Tab / Enter / Space / Arrow keys)
- [ ] 存在しないルートへのアクセスが `{ error: { code: "NOT_FOUND", message: "..." } }` を返す
- [ ] Docker image の最終サイズが `oven/bun:1-alpine` + ffmpeg で 300MB 以下 (HW accel バリアントは別基準)
- [ ] CI が Docker build を検証して緑

## リスクと緩和策

- **`AppType` の変更でクライアントが壊れる**: エラーレスポンス形式統一時に型が変わる → `hc` クライアント再生成 + 型エラーを先に潰してからマージ。
- **Toast 乱発**: エラーが複数連鎖した時に Toast が積み上がる → `sonner` の `duration` とキー重複排除を設定。
- **Docker image slim 化の過剰最適化**: `node_modules` を落としすぎて prisma の native binding が欠けることがある → `prisma generate` 出力は必ず含める。

## 決定済み項目 (当初 open だったもの)

- **log-tail エンドポイント**: 採用 (2026-04-17)。上記 backend チェックリスト参照。
- **disk breakdown**: 採用 (2026-04-17)。`du` は使わず DB sum + `statvfs` でまかなう。

## 共有コントラクト

- **`['health']` query**: 上記 `GET /api/health` と `useHealth` フック。app-shell と settings status tab は必ず同じ query key を使い、単一フェッチ / 単一 15s ポーリングでまかなう。
- **`--shell-offset` / レイアウト変数**: テーマファイル (`packages/client/src/themes/tech.css`) が宣言。`--shell-offset` / `--shell-health-bar-h` / `--shell-nav-bar-h` / `--mobile-nav-h` / `--diag-sidebar-w` / `--now-strip-h` / `--sidebar-w` / `--container-max` 全てここに集約。shell chrome は全ルートで不変 (決定 2026-04-17、`data-mode="player"` による縮退は廃止)。EPG / live-player / recording-player / app-shell はこれらを `var(...)` または Tailwind `h-shell-offset` 等のユーティリティで参照、ハードコード禁止。
- **`<StatusChip>`**: Phase 2 frontend が先行で用意するプリミティブ。Phase 6 ではヘルスサマリ / settings status tab / 各種状態表示でローカル再実装せず再利用する。仕様は [`docs/mocks/app-shell/README.md`](../mocks/app-shell/README.md) §StatusChip。

## 参照スキル

- `bun-hono`、`ffmpeg-hls`、`tanstack-query-best-practices`、`shadcn`、`spatial-nav`
