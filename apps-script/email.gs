/**
 * email.gs — Critical / High のメール通知
 */

function sendEmail_(f) {
  const to = PROP.getProperty('NOTIFY_EMAIL');
  if (!to) {
    Logger.log('NOTIFY_EMAIL not set, skipping mail');
    return;
  }
  const sevLabel = severityLabel_(f.severity);
  const subject = `[${sevLabel}] ${f.project}: ${f.title || f.ruleId}`;
  const dueStr = Utilities.formatDate(f.dueAt, 'Asia/Tokyo', 'yyyy-MM-dd HH:mm') + ' JST';
  const body = [
    `セキュリティ脆弱性検出: ${f.project}`,
    '',
    `重要度    : ${sevLabel} ${severityEmoji_(f.severity)}`,
    `CVE       : ${f.cve || f.ruleId}`,
    `影響範囲  : ${f.package || f.file}${f.startLine ? `:${f.startLine}` : ''}`,
    `影響Ver   : ${f.affectedVersions || '—'}`,
    `修正Ver   : ${f.fixVersions || '（未確認）'}`,
    `担当      : ${f.owner}`,
    `期限      : ${dueStr}`,
    '',
    `Workflow  : ${f.runUrl}`,
    f.link ? `Advisory  : ${f.link}` : '',
    '',
    'Detection ID: ' + f.fingerprint,
    '',
    '----',
    'security-workflows により自動送信',
  ].filter(Boolean).join('\n');

  try {
    MailApp.sendEmail({
      to,
      subject,
      body,
    });
    Logger.log(`[email] sent to ${to}`);
  } catch (e) {
    Logger.log(`[email] error: ${e.message}`);
  }
}
