# telemax (仮称) — 実装ロードマップ

KonomiTV の Python 実装や黒魔術的手法を避け、TypeScript 統一スタックでクリーンに再構築する。外出先からのライブ視聴 (HW トランスコード) が最重要要件。将来的に tvOS/FireTV のリモコン操作 UI にも対応したい。

## 技術スタック

| カテゴリ | 選定 | 理由 |
|---------|------|------|
| ランタイム | **Bun** | 高速、TS 直接実行、`Bun.spawn`/`Bun.file` が強力 |
| バックエンド | **Hono** | 軽量、`hono/streaming`、RPC で型共有 |
| DB | **Postgres 17 + Prisma** | dev は devcontainer 同梱 + pgadmin で閲覧 |
| フロントエンド | **Vite + React 19** | SPA、SEO 不要 |
| ルーティング | **TanStack Router** | file-based、Vite プラグイン |
| データ | **TanStack Query** | キャッシュ・再フェッチ管理 |
| UI | **Shadcn/ui + Tailwind v4** | Radix ベース、トークン設計 |
| プレイヤー | **hls.js** | ブラウザ互換性が高い |
| トランスコード | **FFmpeg** | `nvenc` / `qsv` / `vaapi` / `libx264`、出力は **avc / hevc / vp9** の3コーデック対応 |
| Monorepo | **Bun workspace** | Bun 統一 |
| 認証 | 初期は無し | 後で追加 |

## フェーズ一覧

進捗は各フェーズファイルのチェックボックスで管理する。親サマリは下記。

| # | フェーズ | 工数 | 累計 | 計画ファイル | 状態 |
|---|----------|------|------|--------------|------|
| 0 | プロジェクト基盤 | 1-2 日 | 1-2 日 | [phase-0-foundation.md](phase-0-foundation.md) | 完了 |
| 1 | チャンネル一覧 + Mirakc 連携 | 2-3 日 | 3-5 日 | [phase-1-channels.md](phase-1-channels.md) | 完了 |
| 2 ★ | ライブ HLS ストリーミング | 3-5 日 | 6-10 日 | [phase-2-live-hls.md](phase-2-live-hls.md) | 未着手 |
| 3 | EPG 番組表 | 2-3 日 | 8-13 日 | [phase-3-epg.md](phase-3-epg.md) | 未着手 |
| 4 | 録画 | 3-4 日 | 11-17 日 | [phase-4-recording.md](phase-4-recording.md) | 未着手 |
| 5 | 録画視聴 | 1-2 日 | 12-19 日 | [phase-5-recording-playback.md](phase-5-recording-playback.md) | 未着手 |
| 6 | 品質改善 | 2-3 日 | 14-22 日 | [phase-6-polish.md](phase-6-polish.md) | 未着手 |

**合計: 14-22 日 (1 人月弱)**

## 設計メモ

### FFmpeg トランスコードパイプライン

```
Mirakc /api/services/{id}/stream → fetch (ReadableStream)
  → Bun.spawn FFmpeg stdin (pipe)
  → HLS セグメント出力 (/app/data/hls/{sessionId}/)
  → Hono が playlist.m3u8 / segment を配信
  → ブラウザ hls.js で再生
```

- HW アクセラレーション: `HW_ACCEL_TYPE` env で `nvenc` / `qsv` / `vaapi` / `none` を切替
- 出力コーデック: **avc (H.264) / hevc (H.265) / vp9** の 3 種に対応。iOS Safari (hevc)、モダンブラウザ (vp9)、互換フォールバック (avc) をカバー
- セッション共有: 同一 `(channelId, quality, codec)` の視聴者間で FFmpeg プロセスを共有、viewerCount 0 で idle 停止
- HLS セグメントは **tmpfs** (512M) に配置して disk 摩耗を防ぐ

### Docker 構成 (prod: 3 コンテナ)

```yaml
services:
  mirakc:
    image: mirakc/mirakc:latest
    devices: [/dev/dvb]
  postgres:
    image: postgres:17
    healthcheck: pg_isready
  app:
    build: .
    depends_on: { mirakc, postgres: service_healthy }
    tmpfs: /app/data/hls:size=512M
    environment:
      DATABASE_URL, MIRAKC_URL, HW_ACCEL_TYPE
    # GPU: devices or deploy.resources.reservations
```

> Dev (`.devcontainer/compose.yaml`) には Postgres + pgadmin が既に同梱されている。

### tvOS / FireTV 将来対応の設計方針

- フロントのコア機能 (API 通信、状態管理、ストリーム制御) を **hooks として分離**
- UI レイヤーは薄く保ち、将来 React Native (tvOS/FireTV) に移行しやすくする
- 初期実装では Web UI のみだが、hooks/services 層の再利用を意識した設計
- `@noriginmedia/norigin-spatial-navigation` を後から被せられるよう DOM 順・focus ring を今から整える ([`.claude/skills/spatial-nav/SKILL.md`](../../.claude/skills/spatial-nav/SKILL.md))

## プロジェクト構造 (Phase 0 完了後)

```
telemax/
├── package.json                  # Bun workspace root
├── tsconfig.base.json
├── docker-compose.yml
├── Dockerfile
├── .env.example
├── biome.json                    # 設定済み
│
├── packages/
│   ├── shared/                   # 型定義・定数
│   ├── server/
│   │   ├── prisma/{schema.prisma,migrations/}
│   │   └── src/
│   │       ├── index.ts          # Bun.serve エントリ
│   │       ├── app.ts            # Hono ルート集約 + AppType export
│   │       ├── routes/           # channels, programs, streams, recordings, status
│   │       ├── services/         # mirakc-client, transcoder, stream-manager, recording-manager
│   │       ├── lib/              # ffmpeg, config, logger, prisma
│   │       └── schemas/          # Zod DTO (PascalCase)
│   │
│   └── client/
│       ├── components.json       # Shadcn レジストリ設定
│       ├── vite.config.ts
│       └── src/
│           ├── main.tsx
│           ├── routeTree.gen.ts  # TanStack Router 自動生成
│           ├── routes/           # file-based routing
│           ├── api/client.ts     # hc<AppType>
│           ├── hooks/
│           ├── components/{ui,player,channel,epg,recording}/
│           └── lib/
│
├── data/                         # gitignore: HLS 一時、録画
└── config/mirakc/config.yml
```

## 工数内訳

| フェーズ | 工数 | 備考 |
|---------|------|------|
| Phase 0: 基盤 | 1-2 日 | Bun workspace + 最小 Hono/Vite + Docker skeleton |
| Phase 1: チャンネル + Mirakc | 2-3 日 | RPC 型共有を確立 |
| Phase 2: ライブ HLS ★ | 3-5 日 | **最大リスク**。HW accel + プロセス共有 |
| Phase 3: EPG | 2-3 日 | 仮想スクロール |
| Phase 4: 録画 | 3-4 日 | Prisma 拡張 + スケジューラ |
| Phase 5: 録画視聴 | 1-2 日 | HlsPlayer 再利用 |
| Phase 6: 仕上げ | 2-3 日 | エラー統一、Docker 最適化 |
| **合計** | **14-22 日** | |

## 技術リスク

- **Phase 2 が最大のリスク**: `Bun.spawn` の stdin パイプ ↔ Mirakc の ReadableStream 接続、FFmpeg プロセスの安定管理
- HLS セグメント生成のタイミングと hls.js の読み取りタイミングの同期
- HW エンコーダの Docker コンテナ内での動作確認 (ドライバ依存)

---

**進捗管理**: 各フェーズファイルのチェックボックスで管理。フェーズ完了時にこのファイルの「状態」列を "完了" に更新する。
