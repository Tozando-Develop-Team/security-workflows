/**
 * main.gs — Web App エントリポイント
 *
 * GitHub Actions の post-sarif.sh / post-audit.sh から HMAC 署名つきで POST される
 * JSON ペイロードを受け取り、router.gs に渡して重要度別に振り分ける。
 *
 * Script Properties に設定すべきキー (Script Editor → プロジェクトの設定 → スクリプト プロパティ):
 *   HMAC_KEY              : GitHub Org Secret APPS_SCRIPT_KEY と同じ値
 *   GOOGLE_CHAT_WEBHOOK   : Google Chat スペースの incoming webhook URL
 *   LEDGER_SHEET_ID       : Google Sheets 台帳の spreadsheet ID
 *   GITHUB_TOKEN          : Issue 自動起票用の PAT (repo scope)
 *   GITHUB_ORG            : 既定の owner (例 "Tozando-Develop-Team")
 *   NOTIFY_EMAIL          : Critical/High の通知先 (例 "r.ito@media-jpn.com")
 *   ENV                   : "prod" or "stg"
 */

const PROP = PropertiesService.getScriptProperties();

function doPost(e) {
  try {
    const raw = e.postData.contents;
    const sig = (e.parameter && e.parameter.signature)
      || (e.parameter && e.parameter['X-Signature'])
      || (e.postData && e.postData.contents && tryHeader_(e, 'X-Signature'));

    if (!verifySignature_(raw, sig)) {
      Logger.log('Signature verification failed');
      return jsonResponse_({ ok: false, error: 'invalid_signature' }, 401);
    }

    const payload = JSON.parse(raw);
    Logger.log(`Received event=${payload.event} project=${payload.project} scan_type=${payload.scan_type || '-'}`);

    let result;
    switch (payload.event) {
      case 'scan_result':
        result = handleScanResult_(payload);
        break;
      case 'weekly_summary_request':
        result = handleWeeklySummaryRequest_(payload);
        break;
      default:
        result = { ok: false, error: 'unknown_event', event: payload.event };
    }

    return jsonResponse_(result, 200);
  } catch (err) {
    Logger.log('doPost error: ' + err.stack);
    return jsonResponse_({ ok: false, error: String(err.message || err) }, 500);
  }
}

/**
 * 手動テスト用: スクリプトエディタから直接呼べる。
 * Run > testRun で実行すると、ダミーの Critical 1 件を全経路に流す。
 * （末尾の _ は private 扱いになり関数選択 dropdown に出ないため、敢えて public にしている）
 */
function testRun() {
  const payload = {
    event: 'scan_result',
    project: 'example-project',
    scan_type: 'composer-audit',
    repo: 'your-org/example-project',
    run_url: 'https://github.com/your-org/example-project/actions/runs/0',
    pr_ref: 'pull_request#test-branch',
    ts: Math.floor(Date.now() / 1000),
    findings: [
      {
        package: 'laravel/framework',
        ruleId: 'CVE-2026-DEMO-CRITICAL',
        title: 'Test: Remote Code Execution in test fixture',
        severity: 'critical',
        cve: 'CVE-2026-DEMO-CRITICAL',
        affected_versions: '<10.48.5',
        fix_versions: '>=10.48.5',
        link: 'https://example.com/cve-demo'
      }
    ]
  };
  return handleScanResult_(payload);
}

// ─────────────────────────────────────────────────────────
// helpers
// ─────────────────────────────────────────────────────────

function verifySignature_(rawBody, providedSignature) {
  const key = PROP.getProperty('HMAC_KEY');
  if (!key) {
    Logger.log('HMAC_KEY not configured — skipping verification (insecure!)');
    return true; // 開発時のみ
  }
  if (!providedSignature) return false;
  const expectedBytes = Utilities.computeHmacSha256Signature(rawBody, key);
  const expectedB64 = Utilities.base64Encode(expectedBytes);
  return constantTimeEquals_(expectedB64, providedSignature);
}

function constantTimeEquals_(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

function tryHeader_(e, name) {
  // doPost(e) は header をネイティブに渡してくれないが、念のため
  if (!e || !e.parameters) return null;
  const v = e.parameters[name];
  return Array.isArray(v) ? v[0] : v || null;
}

function jsonResponse_(obj, _status) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
