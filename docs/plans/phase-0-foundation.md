# Phase 0: プロジェクト基盤

| 項目 | 値 |
|------|-----|
| **目標** | Bun workspace が構成され、`GET /api/status` が `{ status: "ok" }` を返し、ブラウザで空の React SPA が表示される |
| **工数** | 1-2 日 |
| **ステータス** | 完了 |
| **前提フェーズ** | なし (最初のフェーズ) |

## 全体フロー

1. `devops` が monorepo ルートと Docker skeleton を用意
2. `backend` が Hono 最小構成と Prisma init
3. `frontend` が Vite + React + TanStack Router + Shadcn init
4. `qa` が型検査 + Biome + 初回コミット

## チェックリスト

### devops
- [x] ルート `package.json` を `private: true` + `workspaces: ["packages/*"]` で作成 — `package.json`
- [x] `tsconfig.base.json` を作成し、`strict: true`、`moduleResolution: "bundler"` 等を設定 — `tsconfig.base.json`
- [x] `.env.example` を作成し `DATABASE_URL`、`MIRAKC_URL`、`HW_ACCEL_TYPE`、`PORT` を記載 — `.env.example`
- [x] `docker-compose.yml` skeleton を作成 (app + postgres + mirakc、まだビルドしない) — `docker-compose.yml`
- [x] `Dockerfile` skeleton を multi-stage (deps / client-build / runtime) で作成、FFmpeg は Phase 2 で入れる — `Dockerfile`
- [x] `.gitignore` に `packages/*/dist/`、`packages/*/node_modules/`、`data/`、`.env` を追加
- [x] `.github/workflows/ci.yml` を新設し PR で `bun install` + 全 workspace の `typecheck` + `bunx biome check .` を実行 — `.github/workflows/ci.yml`

### backend
- [x] Bun workspace ルート (`package.json`) に `packages/server` を登録 — `package.json`
- [x] `tsconfig.base.json` を作成し、`packages/server/tsconfig.json` で extends — `packages/server/tsconfig.json`
- [x] 環境変数を Zod でパースする設定モジュールを実装 (`DATABASE_URL`, `MIRAKC_URL`, `HW_ACCEL_TYPE`, `PORT`) — `packages/server/src/lib/config.ts`
- [x] `pino` + `pino-pretty` のロガーを初期化 — `packages/server/src/lib/logger.ts`
- [x] `PrismaClient` のシングルトンインスタンスを作成 — `packages/server/src/lib/prisma.ts`
- [x] Hono アプリを生成し `AppType` を export (初期ルートは status のみ) — `packages/server/src/app.ts`
- [x] `GET /api/status` ルートを実装 — `packages/server/src/routes/status.ts`
- [x] `Bun.serve` エントリポイントを実装 — `packages/server/src/index.ts`
- [x] `prisma/schema.prisma` の初期スキーマを作成し `bunx prisma migrate dev --name init` を実行 — `packages/server/prisma/schema.prisma`
- [x] `hono/request-id` ミドルウェアと `HTTPException` を捕捉するグローバルエラーハンドラを登録 — `packages/server/src/app.ts`

### frontend
- [x] Vite + React プロジェクトの初期セットアップ、`vite.config.ts` に `@tanstack/router-plugin` と `@vitejs/plugin-react` と `@tailwindcss/vite` を追加 — `packages/client/vite.config.ts`
- [x] TanStack Router のファイルベースルーティングを初期化し、ルートレイアウトを作成 — `packages/client/src/routes/__root.tsx`
- [x] `QueryClient` + `ThemeProvider` (`next-themes`) + `RouterProvider` をエントリに組み込む — `packages/client/src/main.tsx`
- [x] Hono RPC クライアントのシングルトンインスタンスを作成 — `packages/client/src/api/client.ts`
- [x] Tailwind CSS v4 を `@import "tailwindcss"` で設定、Shadcn トークンを有効化 — `packages/client/src/index.css`
- [x] `cn()` ユーティリティ (`tailwind-merge` + `clsx`) を定義 — `packages/client/src/lib/utils.ts`
- [x] `bunx shadcn@latest init` を実行し `components.json` を生成、`Button`/`Card` を追加 — `packages/client/components.json`
- [x] トップページ (空 + `GET /api/status` 表示) を作成 — `packages/client/src/routes/index.tsx`

### qa
- [x] 各 workspace で `bunx tsc -b --noEmit` が通ることを確認
- [x] `bunx biome check .` が clean
- [x] 初回コミット: `chore(foundation): scaffold bun workspace + hono + vite`

## 検証基準 (Phase 完了条件)

- [x] `bun run --cwd packages/server dev` 起動後 `curl http://localhost:11575/api/status` が `{ status: "ok", timestamp: ... }` を返す
- [x] `bun run --cwd packages/client dev` でブラウザが開き、ステータス JSON が画面に表示される
- [x] CI (GitHub Actions) が PR で green
- [x] pgadmin (`http://localhost:8080`) から Postgres に接続でき、空の `_prisma_migrations` テーブルが見える

## リスクと緩和策

- **Tailwind v4 + Shadcn の互換性**: v4 は設定方式が v3 と大きく異なる。`bunx shadcn@latest init` 時のプロンプトで v4 を明示選択、`components.json` の `tailwind.css` と `tailwind.cssVariables` を確認。
- **`@tanstack/router-plugin` の Vite 設定ミス**: `routesDirectory` / `generatedRouteTree` を公式通りに設定しないと `routeTree.gen.ts` が生成されない。
- **`DATABASE_URL` 未設定での起動失敗**: `config.ts` の Zod parse 失敗を起動時に早期 throw して明示的なエラーメッセージを出す。

## 参照スキル

- `bun-hono`、`prisma-postgres`、`tanstack-router`、`shadcn`、`vite`
