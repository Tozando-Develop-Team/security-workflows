# Runbook — アラート受信時の対応

## Critical / High を受け取った時（24h / 48h 期限）

1. **Google Chat の通知カードを開く**
2. **Issue リンクを開く** → 内容を確認
3. **影響範囲のコードを Claude Code で読む**:
   ```
   このリポの `<file>:<line>` に <CVE> の脆弱性が出たので、影響を受ける呼び出し元を全て探して対応案を出して
   ```
4. **修正方針を決める**:
   - 依存バンプで済む → Dependabot PR を Merge (Critical/High は手動でも可)
   - コード修正必要 → 修正 PR 作成 → Codex Review → マージ
   - 影響なし（false positive） → Issue に「false-positive」ラベル + 理由コメント → Close
5. **マージ後の再スキャン**:
   - PR マージで `security-pr.yml` が走り、修正済みなら同 fingerprint は再検知されない
   - Issue を Close → 台帳の status が `closed` に変わる（手動で `markResolved("<fingerprint>", "r-ito")` 実行も可）

## Medium を受け取った時（7d 期限）

1. 即時通知はなし。**月曜 09:00 の週次サマリで気付く**
2. 件数が多い場合は Sheets 台帳の `severity:medium` × `status:open` で絞り込み
3. バッチで Dependabot PR を merge する週次運用に

## Low（30d 期限）

Sheets 台帳のみ追記。月次の振り返りで一括対応する想定。

## 期限超過したら

- 週次サマリの `期限超過` カウンタに上がる
- カウンタが 1 以上で Chat に警告が出る
- 対応を後ろ倒しする場合は Sheets の該当行 `due_at` を手動で延長 + `notes` に理由を記入

## false-positive を抑制したい

### Semgrep

リポ直下に `.semgrepignore`:
```
# テストフィクスチャはスキャン対象外
tests/fixtures/**
**/__tests__/**
**/*.test.ts

# 特定ルールを無効化したい場合はインラインで:
# // nosemgrep: <rule-id>
```

### gitleaks

リポ直下に `.gitleaksignore`:
```
# テストで意図的に入れた fake key
tests/fixtures/fake-jwt.txt:eyJhbGciOiJIUzI1NiIsInR...
```

### OSV-Scanner

リポ直下に `osv-scanner.toml`:
```toml
[[IgnoredVulns]]
id = "GHSA-xxxx-yyyy-zzzz"
ignoreUntil = 2026-12-31
reason = "影響なし: 該当機能を使っていない (確認: 2026-06-01)"
```

## 通知が来ない時

1. GitHub Actions のログを確認
2. Apps Script のログを確認（`script.google.com` → 実行数 / ログ）
3. Google Chat Webhook の URL が変わっていないか
4. `APPS_SCRIPT_URL` Org Secret が最新か

## 緊急ブレーカー（全停止）

| 手段 | 効果 |
|---|---|
| Apps Script の Web App をアーカイブ | 全通知停止、台帳のみ稼働 |
| GitHub Actions の `security-pr.yml` を消費側で削除 | 当該リポのみ停止 |
| `Tozando-Develop-Team/security-workflows` を private に切替 | 全消費リポが参照不能 → 全停止 |

## 関連リンク

- 計画書: `\\wsl.localhost\Ubuntu\home\ryuji\projects\.claude\plans\20260531_security-scanning-system_計画書.md`
- Apps Script デプロイ手順: `apps-script/README.md`
- Deployment Guide: `docs/deployment-guide.md`
