# KotoTV

自宅のチューナーにつながったテレビを、外出先のスマホからでも「開いたら映ってる」体験にする Web アプリ。

## 思想

録画ファイルを探す、BonDriver を切り替える、再生アプリを立ち上げ直す ── テレビを見るまでの工程は、本来「番組を楽しむ」ために必要な操作ではない。KotoTV は Netflix や AbemaTV のように、**開いた瞬間に映像が流れ始める**ことを最優先にしたい。

そのために、以下を設計の軸に置いている：

- **「パッと入力、たまに見返す」温度感を保つ** ── 滞在時間を伸ばす仕掛け・通知・ランキング UI は入れない。テレビはテレビであって、タイムラインではない。
- **外出先が一級市民** ── 自宅の LAN 内で快適であることと、モバイル回線で快適であることは別問題。HW トランスコード・コーデック自動選択・LL-HLS は後付けではなく最初から前提に置く。
- **技術的詳細をユーザーから隠す** ── 「どのチューナー空いてる？」「このチャンネルは何コーデック？」をユーザーに考えさせない。サーバ側がセッションを共有し、クライアント側が端末に合ったコーデックを自動で選ぶ。
- **将来のリモコン操作を今から織り込む** ── tvOS / FireTV への移植を見据え、DOM 順と focus ring を最初から整える。後からリモコン対応を「貼り付ける」のは高コストなので、最初から剥がせる粒度で作る。

技術スタックはこの思想の裏返しで、**TypeScript 1 言語で server から client までひと続き**にすることを選んでいる。Hono RPC で型を共有し、Zod でスキーマ 1 箇所にまとめ、Bun で dev/test/runtime を統一する。Python + Node + PHP のような多言語ブリッジは挟まない。

## スタック

- **ランタイム**: Bun
- **バックエンド**: Hono (`Bun.serve`) + Prisma + Postgres 17
- **フロントエンド**: Vite + React 19 + TanStack Router + TanStack Query + Shadcn/ui + hls.js
- **ストリーミング**: Mirakc → FFmpeg (HW accel) → HLS (tmpfs) → hls.js
- **インフラ**: Docker Compose (mirakc + postgres + app)

---

## 利用者向け

### 機能

#### 視聴

- [x] チャンネル一覧（地上波 / BS / CS）
- [x] ライブ視聴（HLS プレイヤー）
- [ ] HW アクセラレーション（NVENC / QSV / VAAPI）での同時視聴最適化
- [ ] avc / hevc / vp9 の 3 コーデック自動選択（iOS Safari / モダンブラウザ / 互換）
- [ ] 低遅延モード（LL-HLS）

#### 番組表（EPG）

- [x] EPG 画面のスケルトン
- [ ] 仮想スクロールによる高速描画
- [ ] 番組詳細モーダル → そのままライブへ遷移
- [ ] ジャンル / キーワード検索

#### 録画

- [x] 録画ルール CRUD UI
- [x] 録画一覧画面
- [ ] スケジューラによる自動録画実行
- [ ] 録画視聴（シーク・倍速）
- [ ] チャプタースキップ

#### アプリ設定

- [x] デフォルト画質 / コーデック選択
- [x] 自動再生・低遅延トグル
- [x] テーマ切替（ライト / ダーク / システム）
- [ ] PWA オフライン対応
- [ ] tvOS / FireTV 向けリモコン操作

### セットアップ

```sh
# .env.example をコピーして値を埋める
cp .env.example .env

# Docker Compose で mirakc + postgres + app を起動
docker compose up -d
```

ブラウザで `http://localhost:11575` へ。Mirakc 側の DVB デバイスマウント / HW アクセラレーション設定は [`compose.yaml`](compose.yaml) を参照。

---

## 開発者向け

### スタック早見表

| 層 | 採用 |
|----|------|
| Runtime | Bun（`npm` / `yarn` / `pnpm` 不使用） |
| HTTP | Hono + `Bun.serve`、`hc<AppType>` で RPC 型共有 |
| DB | Postgres 17 + Prisma Migrate |
| Client build | Vite + `@tanstack/router-plugin` + `@tailwindcss/vite` |
| UI | React 19 + Tailwind v4 + Shadcn/ui |
| Player | hls.js（`<HlsPlayer>` を live/recording で共有） |
| Lint/Format | Biome（フック / Stop / QA / CI の 4 層） |

詳細は [`CLAUDE.md`](CLAUDE.md) と [`docs/plans/roadmap.md`](docs/plans/roadmap.md)。

### 実装状況

| Phase | 内容 | 状態 |
|-------|------|------|
| 0 | Bun workspace + 最小 Hono/Vite | ✔ 完了 |
| 1 | チャンネル一覧 + Mirakc 連携 | ✔ 完了 |
| 2 ★ | ライブ HLS ストリーミング | ⏳ 進行中 |
| 3 | EPG 番組表 | ・ 未着手 |
| 4 | 録画（スケジューラ） | ・ 未着手 |
| 5 | 録画視聴 | ・ 未着手 |
| 6 | 仕上げ（PWA / Docker 最適化） | ・ 未着手 |

### クイックスタート（devcontainer）

```sh
# VS Code で devcontainer 起動 → 以下は全部コンテナ内で実行
bun install
bunx prisma migrate dev                  # DB = postgres://postgres@postgres:5432/kototv
bun run --cwd packages/client dev        # Vite:  http://localhost:5173
bun run --cwd packages/server dev        # Hono:  http://localhost:11575
```

pgadmin: <http://localhost:8080>（`admin@example.com` / `admin`、接続先は `postgres` / `5432` / `postgres` / `password`）。

### ディレクトリ構成

```
.
├── packages/
│   ├── shared/                 # 型定義・定数
│   ├── server/                 # Hono + Prisma + streaming
│   └── client/                 # Vite + React SPA
├── docs/plans/                 # roadmap.md + フェーズごとの計画
├── config/mirakc/config.yml
├── compose.yaml                # mirakc + postgres + app (prod)
├── Dockerfile                  # multi-stage (bun + ffmpeg)
├── biome.json / .commitlintrc.yaml
├── .claude/                    # agents / skills / settings.json
└── CLAUDE.md                   # Claude Code からの入口
```

## ライセンス

MIT License — [`LICENSE`](LICENSE) を参照。
