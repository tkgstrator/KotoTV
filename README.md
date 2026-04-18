# telemax (仮称) — KonomiTV-clone on Bun + Hono

外出先からのライブ視聴を最優先に、KonomiTV を TypeScript 統一スタックでクリーンに再構築するプロジェクト。

- **ランタイム**: Bun
- **バックエンド**: Hono (`Bun.serve`) + Prisma + Postgres
- **フロントエンド**: Vite + React + TanStack Router + TanStack Query + Shadcn/ui + hls.js
- **ストリーミング**: Mirakc → FFmpeg (HW accel) → HLS (tmpfs) → hls.js
- **インフラ**: Docker Compose (mirakc + postgres + app), devcontainer は Postgres + pgadmin 同梱
- **将来**: tvOS / FireTV 対応を見据え、hooks/services 層を分離

詳細設計は [`docs/plans/roadmap.md`](docs/plans/roadmap.md) を参照。

## クイックスタート（開発）

```sh
# devcontainer 起動 (VS Code) → 以下は全部コンテナ内で実行
bun install
bunx prisma migrate dev          # DB = postgres://postgres@postgres:5432/telemax
bun run --cwd packages/client dev  # Vite: http://localhost:5173
bun run --cwd packages/server dev  # Hono: http://localhost:11575
```

pgadmin: <http://localhost:8080> (`admin@example.com` / `admin`)。Postgres ホスト登録時は `postgres` / `5432` / `postgres` / `password`。

## 実装状況

`docs/plans/roadmap.md` のフェーズ別。現状は **Phase 0 着手前** — エージェント/スキル/ドキュメント一式を用意した段階。

| Phase | 内容 | 状態 |
|-------|------|------|
| 0 | Bun workspace + 最小 Hono/Vite | 未着手 |
| 1 | チャンネル一覧 + Mirakc 連携 | 未着手 |
| 2 ★ | ライブ HLS ストリーミング | 未着手 |
| 3 | EPG 番組表 | 未着手 |
| 4 | 録画 | 未着手 |
| 5 | 録画視聴 | 未着手 |
| 6 | 仕上げ | 未着手 |

## Agent Teams でどう進めるか

Claude Code の Agent Teams 機能を前提に、`leader` が `planner / designer / backend / frontend / streaming / devops / qa` を束ねる構成。

```
/compose        ← leader がプロジェクトの目的を聞いて planner に計画策定を依頼
        ↓
docs/plans/<phase>-<slug>.md    ← planner が計画を書く
        ↓
(UI 有り) designer が docs/mocks/<slug>/ に 2-3 案を作成 → ユーザーが選定
        ↓
ユーザー承認
        ↓
leader が Zod/Prisma schema を先に固定 → 各 specialist を並列起動
        ↓
qa が type check + biome + commit
```

使用するエージェント一覧は [`.claude/agents/`](.claude/agents/)、ドメイン別の設計ガイドは [`.claude/skills/`](.claude/skills/)。

## コード品質ゲート

4 層で Biome と型検査を保証：

1. **PostToolUse フック** — Claude Code が Edit/Write した直後に `bunx biome check --write` を対象ファイルにかける（`.claude/settings.json`）
2. **Stop フック** — ターン終了前にリポジトリ全体の Biome + (あれば) `tsc -b --noEmit`
3. **`qa` エージェント** — 機能実装後に明示的に走らせる最終ゲート
4. **CI** — `.github/workflows/ci.yml` で全ワークスペースの type check + biome

Biome のルールは [`biome.json`](biome.json)。コミット規約は [`.commitlintrc.yaml`](.commitlintrc.yaml)。

## ディレクトリ構成（Phase 0 後の目標）

```
.
├── packages/
│   ├── shared/                 # 型定義・定数
│   ├── server/                 # Hono + Prisma + streaming
│   └── client/                 # Vite + React SPA
├── docs/
│   └── plans/                  # roadmap.md + フェーズごとの計画
├── config/
│   └── mirakc/config.yml
├── compose.yaml          # mirakc + postgres + app (prod)
├── Dockerfile                  # multi-stage (bun + ffmpeg)
├── biome.json
├── .commitlintrc.yaml
├── .claude/
│   ├── agents/                 # leader, planner, backend, frontend, streaming, devops, qa
│   ├── skills/                 # 本プロジェクト向けの設計ガイド
│   └── settings.json           # Biome 自動実行フック等
├── .devcontainer/              # Postgres + pgadmin 同梱
├── .mcp.json                   # docker / github / tailwindcss / shadcn / prisma / zod
└── CLAUDE.md                   # Claude Code からの入口
```

## ライセンス

未定。
