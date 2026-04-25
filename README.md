# KotoTV

自宅のチューナーに繋がっているテレビを、外出先のスマホからでも「開いたら映ってる」体験にするための Web アプリです。

## 目次

- [モチベーション](#モチベーション)
- [動作環境](#動作環境)
  - [サポートするブラウザ](#サポートするブラウザ)
- [備考・注意事項](#備考注意事項)
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

Netflix や AbemaTV のように、**アプリを開いた瞬間に映像が流れ始める** 体験を、地上波・BS・CS のテレビ放送にも持ち込みたい ── それが KotoTV の出発点です。

そのために大切にしていること：

- **サッと見て、それで終わり** ── テレビはタイムラインではないので、通知やランキングで呼び戻すような仕組みは入れていません。
- **外出先でも家と変わらず見られること** ── 細い回線でも止まらないよう、画質や映像形式の調整を裏側で自動的に行っています。
- **仕組みを意識させないこと** ── チューナーが空いてるかとか、コーデックが何とか、そういうことを意識せずに使える設計にしています。
- **いずれテレビの大画面でも使えること** ── Apple TV / Fire TV でリモコン操作できるような画面構成を、今のうちから意識しています。

## 動作環境

- **Docker / Docker Compose が動くこと** ── インストール方法は Docker Compose による起動のみをサポートしています。素の Linux やベアメタル環境へのインストールはサポート対象外です。
- **Mirakc が必須** ── バックエンドのチューナー管理は Mirakc に一本化しています。Mirakurun や EPGStation を直接の依存にはしていません（Mirakc 経由での連携は可能です）。
- **HW エンコーダ推奨** ── 実用的な速度でトランスコードするために、NVIDIA GPU (**CUDA / NVENC**) もしくは Intel CPU 内蔵 GPU (**QSV**) の利用を推奨しています。ソフトウェアエンコードでも動きますが、同時視聴や高解像度配信には現実的ではありません。
- **チューナー** ── Mirakc が対応している DVB デバイス、もしくは PX-W3U4 などの USB チューナー。

### サポートするブラウザ

スマートフォンでの視聴を第一に想定しているため、モバイルブラウザの動作確認を優先しています。

| ブラウザ | バージョン | 備考 |
|---------|-----------|------|
| Safari (iOS) | 16 以降 | 主要ターゲット。HEVC 再生対応 |
| Chrome (Android) | 最新版 | 主要ターゲット。VP9 再生対応 |
| Chrome / Edge (Windows / macOS) | 最新版 | 動作確認対象 |
| Safari (macOS) | 最新版 | 動作確認対象 |
| Firefox | 最新版 | 動作はするが AVC フォールバック中心 |
| Internet Explorer | ── | 対応しません |

- いずれも最新版の利用を推奨します。古いバージョンでは hls.js が動作しない場合があります。
- デスクトップ向けアプリ版の配布予定はありません。

## 備考・注意事項

**まだ開発中のプロジェクトであり、動作保証ができる状態ではありません。**

- 現時点では Phase 6（品質改善）の仕上げが進行中です。主要機能（ライブ視聴・EPG・録画・録画視聴）は実装済みです。
- 詳しい進捗は [実装状況](#実装状況) を参照してください。

**スマートフォンでの視聴を第一に想定しています。**

- PC のブラウザでも動作しますが、UI レイアウトはスマホ縦画面を基準に最適化しています。
- タブレットや PC など大きな画面では、余白が多く感じられる場合があります。

**バックエンドは Mirakc に一本化しています。**

- Mirakurun や EPGStation への直接対応は行っていません（Mirakc 経由での連携は可能です）。
- EDCB には対応していません。

**ハードウェアエンコードが使えない環境では、実用的な動作は期待できません。**

- ソフトウェアエンコードでも再生自体は可能ですが、同時視聴や高解像度配信では速度が追いつかないことがあります。
- NVIDIA GPU (CUDA / NVENC) もしくは Intel CPU 内蔵 GPU (QSV) の利用を推奨します。

**今後、開発の過程で設定ファイルの項目や API の仕様が大きく変わる可能性があります。**

- アップデート時には、`.env` や `compose.yaml` の変更点を確認することをおすすめします。

**不具合報告・フィードバック・Pull Request は歓迎しています。**

- バグを見つけた場合は、Issue からお知らせください。

---

## 利用者向け

### 機能

#### 視聴

- [x] チャンネル一覧（地上波 / BS / CS）
- [x] ライブ視聴（HLS プレイヤー）
- [x] HW アクセラレーション（NVENC / QSV / VAAPI）での同時視聴最適化
- [ ] avc / hevc / vp9 の 3 コーデック自動選択（iOS Safari / モダンブラウザ / 互換）
- [ ] 低遅延モード（LL-HLS）

#### 番組表（EPG）

- [x] EPG 画面のスケルトン
- [x] 仮想スクロールによる高速描画
- [ ] 番組詳細モーダル → そのままライブへ遷移
- [ ] ジャンル / キーワード検索

#### 録画

- [x] 録画ルール CRUD UI
- [x] 録画一覧画面
- [x] スケジューラによる自動録画実行
- [x] 録画視聴（シーク・倍速）
- [ ] チャプタースキップ

#### アプリ設定

- [x] デフォルト画質 / コーデック選択
- [x] 自動再生・低遅延トグル
- [x] テーマ切替（ライト / ダーク / システム）
- [x] PWA オフライン対応
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
| Runtime | Bun |
| HTTP | Hono + `Bun.serve`、`hc<AppType>` で RPC 型共有 |
| DB | Postgres 17 + Prisma Migrate |
| Client build | Vite + `@tanstack/router-plugin` + `@tailwindcss/vite` |
| UI | React 19 + Tailwind v4 + Shadcn/ui |
| Player | hls.js |
| Lint/Format | Biome |

詳細は [`CLAUDE.md`](CLAUDE.md) と [`docs/plans/roadmap.md`](docs/plans/roadmap.md)。

### 実装状況

| Phase | 内容 | 状態 |
|-------|------|------|
| 0 | Bun workspace + 最小 Hono/Vite | ✔ 完了 |
| 1 | チャンネル一覧 + Mirakc 連携 | ✔ 完了 |
| 2 | ライブ HLS ストリーミング | ✔ 完了 |
| 3 | EPG 番組表 | ✔ 完了 |
| 4 | 録画（スケジューラ） | ✔ 完了 |
| 5 | 録画視聴 | ✔ 完了 |
| 6 ★ | 仕上げ（PWA / Docker 最適化） | ⏳ 大部分完了 |

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
