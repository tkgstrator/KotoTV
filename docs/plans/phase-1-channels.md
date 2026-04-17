# Phase 1: チャンネル一覧 + Mirakc 連携

| 項目 | 値 |
|------|-----|
| **目標** | Docker Compose 起動後、ブラウザでチャンネル一覧 (GR/BS/CS フィルタ付き) が表示される |
| **工数** | 2-3 日 |
| **ステータス** | 未着手 |
| **前提フェーズ** | Phase 0 |

## 全体フロー

1. `devops` が `config/mirakc/config.yml` サンプルを置き、Compose を mirakc 含めて起動可能に
2. `designer` がチャンネル一覧のモック 2-3 案を出し、ユーザーが 1 つ選ぶ
3. `backend` が `mirakc-client.ts` と `GET /api/channels` を実装
4. `frontend` が採択モックを React で実装
5. `qa` が型検査 + Biome + コミット

## 採択デザイン

- 候補: v1-v9 (desktop) + mobile-v1 〜 mobile-v5 (mobile) — `docs/mocks/channel-list/`
- **採択 (desktop)**: [`v6-tvguide.html`](../mocks/channel-list/v6-tvguide.html) — 2列高密度、16ch 一画面、TV ガイド的
- **採択 (mobile)**: [`mobile-v3-compact.html`](../mocks/channel-list/mobile-v3-compact.html) — 60px 行、左 72px ch-left + 右プログラム情報、アンダーライン tab filter
- 保留 (chunner 制約で非現実的): v7-streaming, mobile-v4-swipe
- 後回し修正: v6 デスクトップでチャンネル名が折り返す件

## チェックリスト

### designer
- [x] `docs/mocks/channel-list/` に HTML バリアント 2-3 案を生成 (GR/BS/CS 切替、グリッド密度違い、サイドバー vs タブの選択肢含む) — 9 desktop + 5 mobile + filter-styles 比較ページで提供
- [x] 各案の `README.md` に意思決定根拠・Shadcn プリミティブ・ハンドオフノート
- [x] 推奨案を明記、採択 variant にユーザーが決定するまで待つ — 採択: desktop v6-tvguide, mobile mobile-v3-compact

### devops
- [ ] `config/mirakc/config.yml` に DVB チューナ passthrough と最小チャンネル定義 (NHK-G, NHK-E, 地元民放 1 つ) を記載 — `config/mirakc/config.yml`
- [ ] `docker-compose.yml` の mirakc サービスを完成させ、`/dev/dvb` passthrough と `epg-data` volume を定義 — `docker-compose.yml`
- [ ] app サービスに `MIRAKC_URL=http://mirakc:40772` を注入 — `docker-compose.yml`

### backend
- [ ] Mirakc REST API (`GET /api/services`) を `fetch` でラップするクライアントを実装 — `packages/server/src/services/mirakc-client.ts`
- [ ] Mirakc レスポンスの Zod スキーマ (`MirakcServiceSchema`) を定義 — `packages/server/src/schemas/Channel.dto.ts`
- [ ] アプリ内で使う `ChannelSchema` / `ChannelListResponseSchema` を定義 — `packages/server/src/schemas/Channel.dto.ts`
- [ ] `GET /api/channels` ルートを実装 (`?type=GR|BS|CS` クエリを `zValidator` で検証) — `packages/server/src/routes/channels.ts`
- [ ] channels ルートを `app.ts` にマウントし `AppType` を更新 — `packages/server/src/app.ts`
- [ ] `MIRAKC_URL` が疎通できない場合に `HTTPException(502)` を返すエラーハンドリング — `packages/server/src/services/mirakc-client.ts`
- [ ] Mirakc の `service.type === 0x01` (TV) のみフィルタして返す

### frontend
- [ ] `useChannels` フックを作成、`useQuery` で `/api/channels` を取得 (query key: `["channels", type]`) — `packages/client/src/hooks/useChannels.ts`
- [ ] `ChannelCard` コンポーネントを Shadcn `Card` ベースで作成 — `packages/client/src/components/channel/ChannelCard.tsx`
- [ ] `ChannelList` コンポーネントを作成 (チャンネル種別フィルタ `GR/BS/CS` 対応) — `packages/client/src/components/channel/ChannelList.tsx`
- [ ] トップページにチャンネル一覧を組み込む — `packages/client/src/routes/index.tsx`
- [ ] ローディング・エラー状態のスケルトン UI (Shadcn `Skeleton`) — `packages/client/src/components/channel/ChannelList.tsx`

### qa
- [ ] 型検査 + Biome
- [ ] コミット: `feat(channels): list channels via mirakc + basic UI`

## 検証基準

- [ ] `docker compose up` 後、Mirakc 起動状態で `curl /api/channels` がチャンネル配列を返す
- [ ] ブラウザのトップページでチャンネルカードが一覧表示される
- [ ] フィルタ切替 (GR/BS/CS) で表示が絞り込まれる
- [ ] Mirakc 停止時にクライアントにエラー UI が表示される

## リスクと緩和策

- **Mirakc の `/api/services` レスポンス形式バージョン差**: Zod `passthrough()` を使いつつ必須フィールドのみ厳密に型付けして互換性を保つ。
- **`AppType` の更新を frontend が反映できない**: backend が export した後、frontend 側で `hc<AppType>` を再インポートしてコンパイルし直す手順を確認 (Bun workspace の hot reload 範囲)。

## 参照スキル

- `mirakc`、`bun-hono`、`tanstack-query-best-practices`、`shadcn`
