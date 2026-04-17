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
- [ ] `GET /api/health` を追加: Mirakc 疎通、Postgres 疎通、ディスク残量を返す — `packages/server/src/routes/status.ts`

### streaming
- [ ] 起動時に `HLS_DIR` 配下の孤児セッションディレクトリを削除 (サーバ再起動で残留した tmpfs は実際は消えるが、disk 配置に切り替えた場合の保険) — `packages/server/src/services/stream-manager.ts`
- [ ] `HLS_DIR` の合計サイズを定期ポーリング (60s)、閾値超過で warn ログ — `packages/server/src/services/stream-manager.ts`
- [ ] zombie プロセス検出 (`Bun.spawn` の `proc.exited` が resolved なのに Map に残っているセッション) → 自動クリーンアップ

### frontend
- [ ] 全 `useQuery` / `useMutation` のエラーを `sonner` Toast に統一するグローバルハンドラを設定 (`QueryClient` の `defaultOptions`) — `packages/client/src/main.tsx`
- [ ] モバイル・タブレット・デスクトップのブレークポイント対応 (Tailwind `sm:` / `md:` / `lg:`) — `packages/client/src/components/**`
- [ ] `ChannelList` / `EPGGrid` / `RecordingList` のローディング・空状態・エラー状態を Shadcn `Skeleton` / `Alert` で整備
- [ ] キーボードフォーカス順序とリモコン操作を意識した DOM 順序の見直し (`tabIndex`、`aria-label`) — `packages/client/src/components/player/PlayerControls.tsx` 他
- [ ] テーマ切替 (light/dark/system) が全画面で期待通り動くか確認

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

## 参照スキル

- `bun-hono`、`ffmpeg-hls`、`tanstack-query-best-practices`、`shadcn`、`spatial-nav`
