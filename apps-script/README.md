# Apps Script Deployment

Manual setup: ~15 minutes.

## 1. プロジェクト作成

1. <https://script.google.com/> を開く
2. 左上「新しいプロジェクト」をクリック
3. プロジェクト名を **"security-router"** に変更

## 2. ファイル投入（全 7 つ）

このフォルダの中身をそのままコピペで貼り付ける。

| Apps Script 側ファイル | 本リポのファイル |
|---|---|
| `main.gs` | `apps-script/main.gs` |
| `router.gs`（新規） | `apps-script/router.gs` |
| `chat.gs`（新規） | `apps-script/chat.gs` |
| `sheets.gs`（新規） | `apps-script/sheets.gs` |
| `issue.gs`（新規） | `apps-script/issue.gs` |
| `email.gs`（新規） | `apps-script/email.gs` |
| `weekly.gs`（新規） | `apps-script/weekly.gs` |
| `appsscript.json`（既存・編集） | `apps-script/appsscript.json` |

`appsscript.json` は **「プロジェクトの設定」→「『appsscript.json』マニフェスト ファイルをエディタで表示する」をオン** にしてから編集してください。

## 3. Script Properties 設定

「プロジェクトの設定」→「スクリプト プロパティ」→ 「スクリプト プロパティを追加」:

| プロパティ名 | 値 |
|---|---|
| `HMAC_KEY` | 32 文字以上のランダム文字列（後で GitHub Org Secret `APPS_SCRIPT_KEY` と同じ値に）|
| `GOOGLE_CHAT_WEBHOOK` | Google Chat の incoming webhook URL（SEC-3 で取得）|
| `LEDGER_SHEET_ID` | Google Sheets の ID（URL の `/d/` と `/edit` の間）|
| `GITHUB_TOKEN` | GitHub PAT（**repo** + **issues:write** スコープのみ、ファイングレイン推奨）|
| `GITHUB_ORG` | `Tozando-Develop-Team` |
| `NOTIFY_EMAIL` | `r.ito@media-jpn.com` |
| `DEFAULT_OWNER` | `r-ito` |
| `ENV` | `prod` |

`HMAC_KEY` のランダム文字列は以下で生成可:

```bash
openssl rand -hex 32
# 例: 8f3a9b1c4d6e2f7a8b9c1d3e5f7a9b1c8f3a9b1c4d6e2f7a8b9c1d3e5f7a9b1c
```

## 4. Web App デプロイ

1. 右上「デプロイ」→「新しいデプロイ」
2. 設定:
   - 種類: **ウェブアプリ**
   - 説明: `security-router v1`
   - 実行ユーザー: **自分**
   - アクセスできるユーザー: **全員（匿名でも可）**
3. 「デプロイ」をクリック → **ウェブアプリ URL** が出る → コピー

→ この URL を:
- GitHub Org Secret `APPS_SCRIPT_URL` に登録
- Amaterasu の `_categories.yaml` の `security_orchestrator_url` に登録（任意）

## 5. 週次サマリ Trigger 設定

Apps Script エディタで `setupWeeklyTrigger` 関数を 1 回だけ手動実行:

1. ファイル一覧で `weekly.gs` を開く
2. 上のメニューで関数 `setupWeeklyTrigger` を選択
3. 「実行」をクリック
4. 認可ダイアログが出るので承認

これで毎週月曜 09:00 JST に `runWeeklySummary` が走ります。

## 6. 動作テスト

1. `main.gs` の `testRun_` を実行
2. Google Chat に Critical のテストカードが出ることを確認
3. Google Sheets `findings` シートにテスト行が出ることを確認
4. r.ito@media-jpn.com にテストメールが届くことを確認
5. テスト Issue が GitHub に立つことを確認 → 確認後すぐ Close + Sheets のテスト行を手動削除

## 7. 後の更新方法

1. Apps Script エディタでファイルを編集
2. 右上「デプロイ」→「デプロイを管理」→ 該当行の鉛筆アイコン → バージョン「新しいバージョン」→「デプロイ」
3. URL は変わらないので Secret 更新不要

## トラブルシューティング

| 症状 | 対処 |
|---|---|
| `invalid_signature` 401 が返る | `HMAC_KEY` が GitHub Secret と一致しているか確認 |
| Chat に出ない | `GOOGLE_CHAT_WEBHOOK` の URL が間違ってないか、スペースに対応 Webhook がまだ生きているか |
| Issue が立たない | `GITHUB_TOKEN` のスコープ不足 (Issues: write 必須) |
| Sheets に追記されない | シートが共有されていない or `LEDGER_SHEET_ID` 誤り |
| ログを見たい | Apps Script エディタ左メニュー → 「実行数」or 「ログ」 |
