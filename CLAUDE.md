# CLAUDE.md

このファイルは Claude Code がプロジェクトの文脈を最小コストで把握するための入口。新しいセッションは必ずここから読み始めること。

## プロジェクト

KonomiTV クローン。Mirakc に繋がったチューナーを、外出先のスマホから「開いたら映ってる」体験で見るための Web アプリ。将来 tvOS/FireTV 移植を見据える。

- 利用者向けサマリ: [`README.md`](README.md)
- 詳細ロードマップ: [`docs/plans/roadmap.md`](docs/plans/roadmap.md)

## 実装状況

| Phase | 内容 | 状態 |
|-------|------|------|
| 0 | Bun workspace + 最小 Hono/Vite | ✔ 完了 |
| 1 | チャンネル一覧 + Mirakc 連携 | ✔ 完了 |
| 2 | ライブ HLS ストリーミング | ✔ 完了 |
| 3 | EPG 番組表 | ✔ 完了 |
| 4 | 録画（ルール / スケジューラ） | ✔ 完了 |
| 5 | 録画視聴 | ✔ 完了 |
| 6 ★ | 仕上げ（PWA / Docker 最適化 / 低遅延） | ⏳ 進行中 |

フェーズごとの計画は [`docs/plans/phase-*.md`](docs/plans/)。

## スタック早見表

| 層 | 採用 | メモ |
|----|------|------|
| Runtime | **Bun** | `bun` / `bunx` 固定。`npm` / `yarn` / `pnpm` 禁止 |
| Workspace | `packages/server`, `packages/client` | `@kototv/server`, `@kototv/client`。`shared` パッケージは無し |
| HTTP | **Hono** | `Bun.serve`、`hono/streaming`、`hc<AppType>` で RPC |
| Validation | **Zod** + `@hono/zod-validator` | ルートは `zValidator('query'|'param'|'json', schema)` |
| DB | **Postgres 17 + Prisma** | `bunx prisma migrate dev`。生 DDL 禁止。生成先: `packages/server/src/generated/prisma` |
| Dev DB 閲覧 | **pgadmin** | devcontainer 同梱 (<http://localhost:8080>) |
| Mirakc | REST | `/api/services`, `/api/programs`, `/api/services/{id}/stream?decode=1` |
| Transcode | **FFmpeg** (自前ビルド) | Dockerfile で NVENC / VAAPI / QSV / x264 / x265 全部入り |
| HW accel | `nvenc` / `qsv` / `vaapi` / `none` | `HW_ACCEL_TYPE` env、`config/kototv.yaml` の `streaming.hw_accel` |
| HLS | tmpfs | `/app/data/hls/<sessionId>/`、`-hls_flags delete_segments` |
| Client build | **Vite** | `@tanstack/router-plugin`、`@tailwindcss/vite`、`@vitejs/plugin-react` |
| Client UI | **React 19 + Tailwind v4 + Shadcn/ui** | 純黒/純白禁止、Shadcn トークンを使う |
| Routing | **TanStack Router** (file-based) | `packages/client/src/routes/**/*.tsx`、`routeTree.gen.ts` 自動生成 |
| Data | **TanStack Query** | キー `[resource, ...params]`、narrowly invalidate |
| Virtual scroll | `@tanstack/react-virtual` | EPG グリッドで使用 |
| Player | **hls.js** | `<HlsPlayer>` は 1 個、live/recording で共有 |
| Lint/Format | **Biome** | フック / Stop / CI で強制 |
| Logger | `pino` (via `logger.ts`) | JSON、`module` フィールドで child logger |
| Config | `config/kototv.yaml` + env override | `packages/server/src/lib/config.ts` で読み込み |
| CI | GitHub Actions | `.github/workflows/integration.yaml` (CommitLint / Code Check / Run Tests / Docker Build) |
| Deploy | **Cloudflare Workers** | `.github/workflows/deployment.yaml`。`develop` merge → dev、`master` merge → prod |
| E2E | **Playwright** | `tests/{e2e,visual,ux}/`。`bun run test:e2e` / `test:visual` / `test:ux` |

## ディレクトリ構成

```
.
├── packages/
│   ├── server/                    # Hono + Prisma + FFmpeg 制御
│   │   ├── src/
│   │   │   ├── app.ts             # Hono app 組み立て
│   │   │   ├── index.ts           # Bun.serve エントリ
│   │   │   ├── routes/            # channels, programs, streams, recordings,
│   │   │   │                      # recording-rules, encode-profiles, status
│   │   │   ├── services/          # epg-sync, mirakc-client, recording-manager,
│   │   │   │                      # rule-matcher, stream-manager, transcoder,
│   │   │   │                      # encode-benchmark
│   │   │   ├── lib/               # config, logger, prisma, ffmpeg, arib-genre,
│   │   │   │                      # timezone, title-normalize, log-buffer
│   │   │   ├── schemas/           # Zod DTO
│   │   │   └── generated/prisma/  # Prisma Client (git 管理外)
│   │   └── prisma/
│   │       ├── schema.prisma
│   │       ├── seed.ts
│   │       └── migrations/
│   └── client/                    # Vite + React 19 SPA
│       └── src/
│           ├── routes/            # file-based (`__root`, index, epg, live/,
│           │                      # recordings.*, settings)
│           ├── components/        # channel, epg, live, player, recording,
│           │                      # settings, shared, shell, ui
│           ├── hooks/  lib/  api/  themes/  types/
│           └── routeTree.gen.ts   # 自動生成
├── config/
│   ├── kototv.yaml                # ランタイム設定（env でオーバーライド可能）
│   └── mirakc/                    # Mirakc の設定
├── tests/
│   ├── e2e/  visual/  ux/         # Playwright
├── docs/
│   ├── plans/phase-*.md, roadmap.md
│   ├── design/  mocks/
├── compose.yaml                   # 本体（mirakc + postgres + app）
├── compose.nvenc.yaml             # HW accel override (NVIDIA)
├── compose.qsv.yaml               # HW accel override (Intel QSV)
├── compose.vaapi.yaml             # HW accel override (VAAPI)
├── Dockerfile                     # multi-stage: ffmpeg-build → bun runtime
├── entrypoint.sh
├── playwright.config.ts
├── biome.json / .commitlintrc.yaml / tsconfig.base.json
└── .devcontainer/                 # 標準 + cuda/ (NVENC 用)
```

## HW accel 別 compose

本体の `compose.yaml` にトップアップして起動する：

```sh
docker compose -f compose.yaml -f compose.nvenc.yaml up -d     # NVIDIA
docker compose -f compose.yaml -f compose.qsv.yaml up -d       # Intel QSV
docker compose -f compose.yaml -f compose.vaapi.yaml up -d     # VAAPI
docker compose up -d                                            # SW encode
```

## 開発フロー

```sh
# devcontainer 内で
bun install
bunx prisma migrate dev             # DB マイグレーション
bun run --cwd packages/server dev   # Hono: http://localhost:11575
bun run --cwd packages/client dev   # Vite: http://localhost:15575
```

型・lint・テストは root スクリプトから：

- `bun run typecheck` — `tsc -b --noEmit`
- `bun run lint` / `lint:fix` — Biome
- `bun run test` — `bun test packages/`
- `bun run test:e2e` / `test:visual` / `test:ux` — Playwright

## コード品質ゲート

1. **PostToolUse フック**: `Edit` / `Write` / `MultiEdit` の直後、`bunx --bun @biomejs/biome check --write` を対象ファイルに実行（`.claude/settings.json`）
2. **Stop フック**: ターン終了前にリポジトリ全体の Biome + `tsc -b --noEmit`
3. **CI** (`integration.yaml`): CommitLint → Code Check (Biome) → Run Tests (`bun test`) → Docker Build

Biome ルール = [`biome.json`](biome.json)。コミット規約 = [`.commitlintrc.yaml`](.commitlintrc.yaml) の `type-enum` は `build, ui, ci, docs, feat, fix, perf, refactor, revert, format, test, chore`。

## 不変ルール（memory 由来）

- **`bun` / `bunx` 固定**。npx / npm / yarn は使わない。
- **DB スキーマ変更は Prisma Migrate 経由**。生 DDL / `db push` は commit 対象のブランチで禁止。
- **純黒 (#000) / 純白 (#fff) を UI に使わない**。Shadcn のトークンで代替。
- **変更点の説明はリスト形式**。横並び文章は NG。
- **コードの変更を伴う作業の最後は必ずコミット**（commitlint 形式、英語）。
- **アプリの温度感は「パッと入力、たまに見返す」** — 滞在時間を伸ばす系の機能追加は NG。
- **フロントの日付処理は date-fns 経由**。生の `new Date()` / 手動 ms 演算は使わない。
- **Tailwind v4 の important は postfix `!`**（`size-6!`）。プリフィックス形（`!size-6`）は無反応。
- **破壊操作は `destructive` テーマ**。削除ボタンや `AlertDialogAction` は `variant='destructive'`。

## 応答言語

- ユーザーへの返信は**日本語**
- コミットメッセージは**英語**（`.commitlintrc.yaml` の `type-enum` に従う）
- コードコメントは**英語**、かつ「なぜそう書いたか」が自明でない時だけ

## 参考リンク

- ロードマップ: [`docs/plans/roadmap.md`](docs/plans/roadmap.md)
- フェーズ別: [`docs/plans/phase-*.md`](docs/plans/)
- CI ワークフロー: [`.github/workflows/`](.github/workflows/)
- Dev Container 構成の参照元: [qtmleap/devcontainers](https://github.com/qtmleap/devcontainers) (`hono-vite-react-node` + `python-cuda`)
