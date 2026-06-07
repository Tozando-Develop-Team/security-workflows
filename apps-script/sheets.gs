/**
 * sheets.gs — Google Sheets 台帳の読み書き
 *
 * シート構成:
 *   - "findings"  : 個別検出レコード (PK = fingerprint)
 *   - "summary"   : 案件 × 重要度 の集計 (週次サマリのバッキング)
 *   - "meta"      : 設定値・最終週次サマリ送信時刻
 */

const SHEET_FINDINGS = 'findings';
const SHEET_SUMMARY = 'summary';
const SHEET_META = 'meta';

const FINDINGS_HEADERS = [
  'fingerprint', 'detected_at', 'project', 'repo', 'scan_type',
  'severity', 'rule_id', 'cve', 'title', 'file', 'start_line',
  'package', 'affected_versions', 'fix_versions',
  'owner', 'due_at', 'status', 'issue_url', 'run_url',
  'resolved_at', 'resolved_by', 'notes',
];

function getLedger_() {
  const id = PROP.getProperty('LEDGER_SHEET_ID');
  if (!id) throw new Error('LEDGER_SHEET_ID is not set');
  return SpreadsheetApp.openById(id);
}

function getOrCreateSheet_(ss, name, headers) {
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    if (headers && headers.length) {
      sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
      sh.setFrozenRows(1);
    }
  }
  return sh;
}

/**
 * fingerprint で既存行を探し、なければ追記する。
 * 返り値: { created: true, row: rowIndex } or { created: false, row: rowIndex }
 */
function upsertLedgerRow_(f) {
  const ss = getLedger_();
  const sh = getOrCreateSheet_(ss, SHEET_FINDINGS, FINDINGS_HEADERS);
  const lastRow = sh.getLastRow();

  if (lastRow >= 2) {
    const fpCol = sh.getRange(2, 1, lastRow - 1, 1).getValues();
    for (let i = 0; i < fpCol.length; i++) {
      if (fpCol[i][0] === f.fingerprint) {
        // 既存 — 何もしない (status が closed なら復活させない)
        return { created: false, row: i + 2 };
      }
    }
  }

  const row = [
    f.fingerprint,
    f.detectedAt,
    f.project,
    f.repo,
    f.scanType,
    f.severity,
    f.ruleId,
    f.cve,
    f.title,
    f.file,
    f.startLine,
    f.package,
    f.affectedVersions,
    f.fixVersions,
    f.owner,
    f.dueAt,
    f.status,
    '',           // issue_url (後で update)
    f.runUrl,
    '',           // resolved_at
    '',           // resolved_by
    '',           // notes
  ];
  sh.appendRow(row);
  return { created: true, row: sh.getLastRow() };
}

function updateLedgerWithIssue_(fingerprint, issueUrl) {
  const ss = getLedger_();
  const sh = ss.getSheetByName(SHEET_FINDINGS);
  if (!sh) return;
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return;
  const fps = sh.getRange(2, 1, lastRow - 1, 1).getValues();
  for (let i = 0; i < fps.length; i++) {
    if (fps[i][0] === fingerprint) {
      sh.getRange(i + 2, FINDINGS_HEADERS.indexOf('issue_url') + 1).setValue(issueUrl);
      return;
    }
  }
}

/**
 * resolved 状態を更新する。GitHub Issue を閉じた際に webhook で呼ばれる想定
 * (現状は手動 or 別 trigger から呼ぶ)。
 */
function markResolved(fingerprint, resolvedBy) {
  const ss = getLedger_();
  const sh = ss.getSheetByName(SHEET_FINDINGS);
  const lastRow = sh.getLastRow();
  const fps = sh.getRange(2, 1, lastRow - 1, 1).getValues();
  for (let i = 0; i < fps.length; i++) {
    if (fps[i][0] === fingerprint) {
      sh.getRange(i + 2, FINDINGS_HEADERS.indexOf('status') + 1).setValue('closed');
      sh.getRange(i + 2, FINDINGS_HEADERS.indexOf('resolved_at') + 1).setValue(new Date());
      sh.getRange(i + 2, FINDINGS_HEADERS.indexOf('resolved_by') + 1).setValue(resolvedBy || '');
      return true;
    }
  }
  return false;
}

/**
 * 週次サマリで使う集計: 直近 7 日 + open のままの全 finding
 */
function summarizeOpen_(project) {
  const ss = getLedger_();
  const sh = ss.getSheetByName(SHEET_FINDINGS);
  if (!sh) return { critical: 0, high: 0, medium: 0, low: 0, overdue: 0, items: [] };
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return { critical: 0, high: 0, medium: 0, low: 0, overdue: 0, items: [] };
  const data = sh.getRange(2, 1, lastRow - 1, FINDINGS_HEADERS.length).getValues();
  const now = new Date();
  const out = { critical: 0, high: 0, medium: 0, low: 0, overdue: 0, items: [] };
  for (const row of data) {
    const rec = Object.fromEntries(FINDINGS_HEADERS.map((h, i) => [h, row[i]]));
    if (rec.status === 'closed') continue;
    if (project && rec.project !== project) continue;
    if (out[rec.severity] != null) out[rec.severity]++;
    if (rec.due_at && new Date(rec.due_at) < now) out.overdue++;
    out.items.push(rec);
  }
  return out;
}
