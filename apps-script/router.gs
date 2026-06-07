/**
 * router.gs — 重要度別ルーティング
 *
 * Critical / High → Chat 即時 + Email + Issue 起票 + Sheets 追記
 * Medium          → Sheets 追記 + 週次サマリ対象
 * Low             → Sheets 追記のみ
 */

const SEVERITY_CRITICAL = ['critical', 'error'];
const SEVERITY_HIGH = ['high'];
const SEVERITY_MEDIUM = ['medium', 'warning', 'moderate'];
const SEVERITY_LOW = ['low', 'info', 'note'];

const DUE_DAYS_BY_SEVERITY = {
  critical: 1,   // 24h
  high: 2,       // 48h
  medium: 7,
  low: 30,
};

function handleScanResult_(payload) {
  const findings = (payload.findings || []).map((f) => normalizeFinding_(f, payload));
  if (findings.length === 0) {
    Logger.log(`No findings for ${payload.project} / ${payload.scan_type}`);
    return { ok: true, processed: 0 };
  }

  const counts = { critical: 0, high: 0, medium: 0, low: 0 };

  for (const f of findings) {
    const sev = severityBucket_(f.severity);
    counts[sev] = (counts[sev] || 0) + 1;

    // 全件 Sheets 台帳に追記 (idempotency: 同 finding 再記入を防止するため fingerprint で判定)
    const ledgerResult = upsertLedgerRow_(f);

    if (sev === 'critical' || sev === 'high') {
      if (ledgerResult.created) {
        // 初検出のみ Chat + Email + Issue (重複通知を避ける)
        sendChatCard_(f);
        sendEmail_(f);
        const issueUrl = createIssue_(f);
        if (issueUrl) updateLedgerWithIssue_(f.fingerprint, issueUrl);
      } else {
        Logger.log(`[router] skip already-reported: ${f.fingerprint}`);
      }
    }
  }

  return { ok: true, processed: findings.length, counts };
}

function handleWeeklySummaryRequest_(payload) {
  return buildAndSendWeeklySummary_(payload.project);
}

// ─────────────────────────────────────────────────────────
// finding normalization
// ─────────────────────────────────────────────────────────

function normalizeFinding_(raw, payload) {
  const severity = inferSeverity_(raw);
  const project = payload.project;
  const repo = payload.repo;
  const scanType = payload.scan_type;
  const ruleId = raw.ruleId || raw.cve || 'unknown';
  const message = raw.title || raw.message || '';
  const file = raw.file || raw.package || '';
  const startLine = raw.startLine || 0;
  const fpInput = [project, repo, scanType, ruleId, file, startLine].join('|');
  const fingerprint = Utilities.base64Encode(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, fpInput),
  ).substring(0, 16);

  return {
    fingerprint,
    project,
    repo,
    scanType,
    ruleId,
    severity,
    title: message,
    file,
    startLine,
    package: raw.package || '',
    affectedVersions: raw.affected_versions || '',
    fixVersions: raw.fix_versions || '',
    cve: raw.cve || (ruleId && ruleId.startsWith('CVE-') ? ruleId : ''),
    link: raw.link || '',
    runUrl: payload.run_url || '',
    prRef: payload.pr_ref || '',
    detectedAt: new Date(),
    dueAt: addDays_(new Date(), DUE_DAYS_BY_SEVERITY[severity] || 30),
    owner: PROP.getProperty('DEFAULT_OWNER') || 'r-ito',
    status: 'open',
  };
}

function inferSeverity_(raw) {
  const s = String(raw.severity || raw.level || 'low').toLowerCase();
  if (SEVERITY_CRITICAL.includes(s)) return 'critical';
  if (SEVERITY_HIGH.includes(s)) return 'high';
  if (SEVERITY_MEDIUM.includes(s)) return 'medium';
  return 'low';
}

function severityBucket_(sev) {
  if (sev === 'critical') return 'critical';
  if (sev === 'high') return 'high';
  if (sev === 'medium') return 'medium';
  return 'low';
}

function addDays_(d, n) {
  const x = new Date(d.getTime());
  x.setDate(x.getDate() + n);
  return x;
}

function severityEmoji_(sev) {
  return { critical: '🔴', high: '🟠', medium: '🟡', low: '⚪' }[sev] || '⚪';
}

function severityLabel_(sev) {
  return { critical: 'CRITICAL', high: 'HIGH', medium: 'MEDIUM', low: 'LOW' }[sev] || 'LOW';
}
