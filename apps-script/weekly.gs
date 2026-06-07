/**
 * weekly.gs — 週次サマリ生成
 *
 * 2 つの呼ばれ方:
 *   1. weekly-scan.yml の最終ジョブから request_summary イベントとして
 *   2. Apps Script の時間トリガー (毎週月曜 09:00 JST)
 *
 * 動作:
 *   - 全 open finding を集計
 *   - 案件 × 重要度 のテーブル化
 *   - Critical/High が overdue なら強調
 *   - Chat に投稿 (single text card)
 */

const WEEKLY_TRIGGER_HOUR = 9; // JST

function setupWeeklyTrigger() {
  // 既存トリガーをクリア
  ScriptApp.getProjectTriggers().forEach((t) => {
    if (t.getHandlerFunction() === 'runWeeklySummary') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('runWeeklySummary')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.MONDAY)
    .atHour(WEEKLY_TRIGGER_HOUR)
    .inTimezone('Asia/Tokyo')
    .create();
  Logger.log('Weekly trigger installed: Monday 09:00 JST');
}

function runWeeklySummary() {
  return buildAndSendWeeklySummary_(null /* all projects */);
}

function buildAndSendWeeklySummary_(scopedProject) {
  const ss = getLedger_();
  const sh = ss.getSheetByName(SHEET_FINDINGS);
  if (!sh) {
    sendChatText_('週次サマリ: 台帳シートが見つかりません');
    return { ok: false, error: 'no_sheet' };
  }
  const lastRow = sh.getLastRow();
  if (lastRow < 2) {
    sendChatText_('週次サマリ: open 案件なし 🟢');
    return { ok: true, total: 0 };
  }
  const data = sh.getRange(2, 1, lastRow - 1, FINDINGS_HEADERS.length).getValues();

  // project → { critical, high, medium, low, overdue }
  const byProject = {};
  const now = new Date();

  for (const row of data) {
    const rec = Object.fromEntries(FINDINGS_HEADERS.map((h, i) => [h, row[i]]));
    if (rec.status === 'closed') continue;
    if (scopedProject && rec.project !== scopedProject) continue;
    const k = rec.project || '(unknown)';
    if (!byProject[k]) byProject[k] = { critical: 0, high: 0, medium: 0, low: 0, overdue: 0 };
    if (byProject[k][rec.severity] != null) byProject[k][rec.severity]++;
    if (rec.due_at && new Date(rec.due_at) < now) byProject[k].overdue++;
  }

  const projects = Object.keys(byProject).sort();
  if (projects.length === 0) {
    sendChatText_('週次サマリ: open 案件なし 🟢');
    return { ok: true, total: 0 };
  }

  const text = renderWeeklyText_(byProject, projects, scopedProject);
  sendChatText_(text);

  // 最終送信時刻を meta に書く
  const metaSh = getOrCreateSheet_(ss, SHEET_META, ['key', 'value']);
  metaSh.appendRow(['last_weekly_summary_at', new Date()]);

  return { ok: true, projects: projects.length };
}

function renderWeeklyText_(byProject, projects, scoped) {
  const todayJst = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
  const lines = [];
  lines.push(`📊 *週次セキュリティサマリ* (${todayJst} JST)`);
  if (scoped) lines.push(`scope: \`${scoped}\``);
  lines.push('');
  lines.push('```');
  lines.push('案件                          🔴C  🟠H  🟡M  ⚪L  期限超過');
  lines.push('─'.repeat(60));
  let totals = { critical: 0, high: 0, medium: 0, low: 0, overdue: 0 };
  for (const p of projects) {
    const x = byProject[p];
    lines.push(
      pad_(p, 28) +
      pad_(String(x.critical), 5, true) +
      pad_(String(x.high), 5, true) +
      pad_(String(x.medium), 5, true) +
      pad_(String(x.low), 5, true) +
      pad_(String(x.overdue), 8, true)
    );
    totals.critical += x.critical;
    totals.high += x.high;
    totals.medium += x.medium;
    totals.low += x.low;
    totals.overdue += x.overdue;
  }
  lines.push('─'.repeat(60));
  lines.push(
    pad_('TOTAL', 28) +
    pad_(String(totals.critical), 5, true) +
    pad_(String(totals.high), 5, true) +
    pad_(String(totals.medium), 5, true) +
    pad_(String(totals.low), 5, true) +
    pad_(String(totals.overdue), 8, true)
  );
  lines.push('```');
  lines.push('');
  if (totals.overdue > 0) lines.push(`⚠️ 期限超過 *${totals.overdue}* 件あり`);
  if (totals.critical > 0) lines.push(`🔴 Critical 未解決 *${totals.critical}* 件`);
  const sid = PROP.getProperty('LEDGER_SHEET_ID');
  if (sid) lines.push(`台帳: https://docs.google.com/spreadsheets/d/${sid}/edit`);
  return lines.join('\n');
}

function pad_(s, width, rightAlign) {
  // 全角を考慮しないシンプル版 (英数字想定)
  if (s.length >= width) return s;
  const space = ' '.repeat(width - s.length);
  return rightAlign ? space + s : s + space;
}
