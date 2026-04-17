# CLAUDE.md

このファイルは Claude Code がプロジェクトの文脈を最小コストで把握するための入口。新しいセッションは必ずここから読み始めること。

## プロジェクト

KonomiTV クローン。Bun + Hono (Prisma + Postgres) / Vite + React + TanStack Router + Shadcn/ui / FFmpeg → HLS。外出先ライブ視聴が最重要要件、将来 tvOS/FireTV 移植を見据える。

- 詳細: [`docs/plans/roadmap.md`](docs/plans/roadmap.md)
- ユーザー向けサマリ: [`README.md`](README.md)

## スタック早見表

| 層 | 採用 | メモ |
|----|------|------|
| Runtime | **Bun** | `bun` / `bunx` 固定。`npm` / `yarn` / `pnpm` 禁止 |
| HTTP | **Hono** | `Bun.serve`、`hono/streaming`、`hc<AppType>` で RPC |
| DB | **Postgres 17 + Prisma** | `bunx prisma migrate dev`。生 DDL 禁止 |
| Dev DB 閲覧 | **pgadmin** | devcontainer 同梱 (<http://localhost:8080>) |
| Mirakc | REST | `/api/services`, `/api/programs`, `/api/services/{id}/stream?decode=1` |
| Transcode | **FFmpeg** | HW: `nvenc` / `qsv` / `vaapi` / `none`。`HW_ACCEL_TYPE` env |
| HLS | tmpfs | `/app/data/hls/<sessionId>/`、`-hls_flags delete_segments` |
| Client build | **Vite** | `@tanstack/router-plugin`、`@tailwindcss/vite` |
| Client UI | **React 19 + Tailwind v4 + Shadcn/ui** | 純黒/純白禁止、Shadcn トークンを使う |
| Routing | **TanStack Router** (file-based) | `src/routes/**/*.tsx`、`routeTree.gen.ts` 自動生成 |
| Data | **TanStack Query** | キー `[resource, ...params]`、narrowly invalidate |
| Player | **hls.js** | `<HlsPlayer>` は 1 個、live/recording で共有 |
| Lint/Format | **Biome** | 4 層で強制 (フック / Stop / QA / CI) |
| Logger | `pino` | JSON、requestId 付き |
| Container | Docker Compose | mirakc + postgres + app (prod)。dev は devcontainer |
| CI | GitHub Actions | `.github/workflows/ci.yml` |

## エージェント配置（Agent Teams）

`.claude/agents/` 配下。`/compose` で leader が統括。

| エージェント | 担当 |
|------------|------|
| [`leader`](.claude/agents/leader.md) | 計画・分解・並列実行・集約。コードは書かない |
| [`planner`](.claude/agents/planner.md) | `docs/plans/*.md` 執筆。設計判断 |
| [`designer`](.claude/agents/designer.md) | `docs/mocks/<slug>/` に HTML バリアントを複数提示 → ユーザー選定。実装はしない |
| [`backend`](.claude/agents/backend.md) | `packages/server/**` 以外 transcoder/stream-manager/ffmpeg.ts。Hono / Prisma / Mirakc クライアント |
| [`frontend`](.claude/agents/frontend.md) | `packages/client/**`。選ばれたモックを React / TanStack Router / Shadcn / hls.js で実装 |
| [`streaming`](.claude/agents/streaming.md) | FFmpeg コマンド、`Bun.spawn`、HLS セッション管理、ストリーム HTTP |
| [`devops`](.claude/agents/devops.md) | `Dockerfile` / `docker-compose.yml` / CI / HW accel 配線 |
| [`qa`](.claude/agents/qa.md) | 型チェック + biome + commitlint フォーマットでコミット |
| [`visual-qa`](.claude/agents/visual-qa.md) | Playwright でモック整合 / UX（折返し・スクロール・フォーカス）/ E2E をチェック。修正はしない |

## スキル（ドメイン別ガイド）

`.claude/skills/` 配下。該当コードを触るときに Claude Code が自動でロード。

| スキル | 起動条件（抜粋） |
|--------|-------------------|
| [`bun-hono`](.claude/skills/bun-hono/SKILL.md) | `packages/server/src/{index,app,routes}/**` |
| [`prisma-postgres`](.claude/skills/prisma-postgres/SKILL.md) | Prisma schema / migration / client instantiation |
| [`mirakc`](.claude/skills/mirakc/SKILL.md) | Mirakc REST 連携 |
| [`ffmpeg-hls`](.claude/skills/ffmpeg-hls/SKILL.md) | FFmpeg 起動、HLS 出力、セッション管理 |
| [`hls-player`](.claude/skills/hls-player/SKILL.md) | `<HlsPlayer>` と `useLiveStream` |
| [`tanstack-router`](.claude/skills/tanstack-router/SKILL.md) | file-based routing、Zod search, loader 連携 |
| [`tanstack-query-best-practices`](.claude/skills/tanstack-query-best-practices/SKILL.md) | query keys / invalidation / mutation |
| [`shadcn`](.claude/skills/shadcn/SKILL.md) | Shadcn/ui 追加・構成・MCP 経由の利用 |
| [`vite`](.claude/skills/vite/SKILL.md) | `vite.config.ts` / プラグイン |
| [`spatial-nav`](.claude/skills/spatial-nav/SKILL.md) | 将来の tvOS/FireTV に備えた DOM/focus ルール |
| [`pwa`](.claude/skills/pwa/SKILL.md) | Service Worker / オフライン (将来オプション) |
| [`compose`](.claude/skills/compose/SKILL.md) | `/compose` の Agent Team ワークフロー定義 |

## MCP サーバ（`.mcp.json`）

| サーバ | 用途 |
|--------|------|
| `docker` | `docker compose` の確認・Docker 操作 (`devops`) |
| `github` | PR / Issue / PR review (`leader` / `qa`) |
| `tailwindcss` | Tailwind ユーティリティ参照 (`frontend`) |
| `shadcn` | Shadcn レジストリ参照・`add` コマンド生成 (`frontend`) |
| `prisma` | Prisma ドキュメント / マイグレーション支援 (`backend`) |
| `zod` | Zod ドキュメント |

## コード品質ゲート

1. **PostToolUse フック**: `Edit` / `Write` / `MultiEdit` の直後、`bunx --bun @biomejs/biome check --write` を対象ファイルに実行（`.claude/settings.json`）
2. **Stop フック**: ターン終了前にリポジトリ全体の Biome + (`tsconfig.base.json` があれば) `tsc -b --noEmit`
3. **`qa` エージェント**: 実装後に明示的に走らせる最終ゲート。commitlint 形式でコミット
4. **CI**: `.github/workflows/ci.yml`（Phase 0 で `devops` が作成）

Biome ルール = [`biome.json`](biome.json)。コミット規約 = [`.commitlintrc.yaml`](.commitlintrc.yaml) で `build, ui, ci, docs, feat, fix, perf, refactor, revert, format, test, chore`。

## 不変ルール（memory 由来）

- **`bun` / `bunx` 固定**。npx/npm/yarn は使わない。
- **DB スキーマ変更は Prisma Migrate 経由**。生 DDL / `db push` は commit 対象のブランチで禁止。
- **純黒 (#000) / 純白 (#fff) を UI に使わない**。Shadcn のトークンで代替。
- **変更点の説明はリスト形式**。横並び文章はＮＧ。
- **コードの変更を伴う作業の最後は必ずコミット**（commitlint 形式）。
- **`/admin/*` の認証は Cloudflare Access 側**。React 側では認証チェック不要。
- **`.devcontainer/auth` は削除禁止**（Firebase エミュレータのシード）。
- **アプリの温度感は「パッと入力、たまに見返す」** — 滞在時間を伸ばす系の機能追加は NG。

## 開始パターン

| ユーザー入力 | 推奨アクション |
|--------------|---------------|
| "Phase N やって" | `/compose` → planner → 承認 → 並列実行 |
| "ちょっと修正して (1 ファイル)" | 単体 specialist に直接投げる。planner スキップ |
| "EPG 画面作って" | `/compose` → planner → designer (3 案) → ユーザー選定 → backend/frontend 並列 |
| "画面デザインだけ検討" | `designer` 単体 (実装は後日) |
| "FFmpeg 周り直して" | `streaming` 単体 |
| "Dockerfile 直して" | `devops` 単体 |

## 応答言語

- ユーザーへの返信は**日本語**
- エージェント間のプロンプト / 応答は**英語**
- コードコメントは**英語**、かつ「なぜそう書いたか」が自明でない時だけ

## まだ Phase 0 が済んでいないこと

以下は `docs/plans/roadmap.md` の Phase 0 で devops + backend + frontend が作る。現時点では **ない** こと前提で計画する：

- `package.json` (root workspace), `packages/*/package.json`
- `bun.lock`
- `tsconfig.base.json`, `packages/*/tsconfig.json`
- `packages/client/components.json`, `packages/client/vite.config.ts`
- `packages/server/prisma/schema.prisma` と `migrations/`
- `Dockerfile`, `docker-compose.yml`, `config/mirakc/config.yml`
- `.env.example`
- `.github/workflows/ci.yml`

## 参考リンク

- ロードマップ: `docs/plans/roadmap.md`
- エージェント定義: `.claude/agents/*.md`
- スキル: `.claude/skills/**/SKILL.md`
- 設定: `.claude/settings.json`, `biome.json`, `.commitlintrc.yaml`
