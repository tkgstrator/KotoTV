# Playwright tests

`bunx playwright test` をルートで実行。開発サーバーは別ターミナルで起動しておくこと（`bun dev`）。

## ディレクトリ

| ディレクトリ | 目的 | 失敗時の扱い |
|---|---|---|
| `e2e/` | ユーザー操作シナリオ（ライブ再生、チャンネル遷移、検索…） | 機能回帰として fix |
| `visual/` | `docs/mocks/**/*.html` と本番 UI の見た目整合 | 差分を確認、モック or 実装を更新 |
| `ux/` | 折返し、スクロール、オーバーフロー、リサイズ、フォーカス順、a11y | UX 不具合として起票 |

## 環境変数

- `CLIENT_URL` — 対象の URL（デフォルト `http://localhost:5173`）
- `MOCK_ROOT` — モック HTML のルート（デフォルト `./docs/mocks`）

## 成果物

- `tests/.report/` — HTML レポート
- `tests/.artifacts/` — トレース・動画・失敗スクショ
- `tests/visual/__screenshots__/` — ビジュアルスナップショット（baseline）

## プロジェクト

- `desktop-chromium` / `mobile-chromium` — E2E
- `visual-desktop` / `visual-mobile` — モック比較
- `ux-audit` — UX 自動監査
