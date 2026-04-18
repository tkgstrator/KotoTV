# KotoTV

自宅のチューナーに繋がっているテレビを、外出先のスマホからでも「開いたら映ってる」体験にするための Web アプリです。

## 目次

- [モチベーション](#モチベーション)
- [利用者向け](#利用者向け)
  - [機能](#機能)
    - [視聴](#視聴)
    - [番組表（EPG）](#番組表epg)
    - [録画](#録画)
    - [アプリ設定](#アプリ設定)
  - [セットアップ](#セットアップ)
- [開発者向け](#開発者向け)
  - [スタック早見表](#スタック早見表)
  - [実装状況](#実装状況)
  - [クイックスタート（devcontainer）](#クイックスタートdevcontainer)
  - [ディレクトリ構成](#ディレクトリ構成)
- [ライセンス](#ライセンス)

## モチベーション

そもそもテレビを視聴するに至るまでの工程が、あまりにも煩雑すぎるのではないでしょうか。録画ファイルをフォルダの奥から探し出したり、BonDriver を切り替えたり、再生アプリを起動し直したり──これらは本来、番組を楽しむために必要な操作ではないはずです。

Netflix や AbemaTV であれば、アプリを開いた瞬間に映像が流れ始めるのが当たり前になっています。KotoTV はこの体験を、地上波・BS・CS のテレビ放送にも持ち込むことを目指しています。

そのために、以下の 4 点を大切にしていきたいと考えています。

- **見たいときにサッと見て、それで終わり** ── 通知で呼び戻したり、ランキングで次の番組を追わせたりはしません。テレビはテレビであって、だらだら眺めるためのタイムラインではないはずです。見終わったらスッと閉じられる、それくらいの距離感を目指しています。
- **外出先でも家と変わらず見られること** ── 自宅の Wi-Fi で快適に動くことと、電車の中で快適に動くことは、まったく別の話です。回線が細くても止まらない・遅れないように、画質を自動で落としたり、お使いの端末に合わせた映像に変換したりする処理を、最初から用意しておきたいと考えています。
- **仕組みを意識させないこと** ── 「今このチャンネルは誰かに使われていないか」「自分の端末で再生できる形式はどれか」といった問いを、利用者に突きつけるべきではありません。裏側で自動的に判断し、ユーザーはチャンネル名をタップするだけ、という状態が理想です。
- **将来的にテレビの大画面でも使えること** ── いずれ Apple TV や Fire TV への対応が見据えられており、リモコンのカーソル移動で操作できるような画面構成を、今のうちから意識しておく必要があります。後から無理に対応させようとすると、画面全体を作り直すことになりかねません。

技術選定もこの方針の裏返しになっていて、**TypeScript という 1 つの言語で、サーバからクライアントまでを一気通貫に書けること**を最優先に考えています。Hono RPC で型を共有し、Zod でスキーマを 1 箇所に集約し、Bun で開発・テスト・ランタイムを統一する。こうすることで、Python と Node と PHP を跨ぐようなブリッジ実装を挟まずに済むわけです。

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
