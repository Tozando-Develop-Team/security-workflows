/**
 * issue.gs — GitHub Issue 自動起票 (Critical / High のみ)
 *
 * Script Properties:
 *   GITHUB_TOKEN  : repo scope を持つ PAT
 *   GITHUB_ORG    : 既定の owner (例 "Tozando-Develop-Team")
 *
 * The repo is read from payload.repo (form: "owner/name").
 */

function createIssue_(f) {
  const token = PROP.getProperty('GITHUB_TOKEN');
  if (!token) {
    Logger.log('GITHUB_TOKEN not set, skipping issue');
    return null;
  }
  if (!f.repo || f.repo.split('/').length !== 2) {
    Logger.log('repo not in owner/name form: ' + f.repo);
    return null;
  }

  const url = `https://api.github.com/repos/${f.repo}/issues`;
  const body = buildIssueBody_(f);

  const payload = {
    title: `[${severityLabel_(f.severity)}] ${f.title || f.ruleId} (${f.scanType})`,
    body,
    labels: [
      'security',
      `severity:${f.severity}`,
      `scan:${f.scanType}`,
      'auto-generated',
    ],
    assignees: [f.owner].filter((x) => x && !x.startsWith('@')),
  };

  const resp = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });

  const code = resp.getResponseCode();
  if (code >= 200 && code < 300) {
    const json = JSON.parse(resp.getContentText());
    Logger.log(`[issue] created: ${json.html_url}`);
    return json.html_url;
  }
  Logger.log(`[issue] error HTTP ${code}: ${resp.getContentText().substring(0, 300)}`);
  return null;
}

function buildIssueBody_(f) {
  const dueStr = Utilities.formatDate(f.dueAt, 'Asia/Tokyo', 'yyyy-MM-dd HH:mm') + ' JST';
  const lines = [
    `> 🤖 このIssue は security-workflows により自動起票されました`,
    '',
    '## 概要',
    '',
    `**${f.title || f.ruleId}**`,
    '',
    '## 詳細',
    '',
    '| 項目 | 値 |',
    '|---|---|',
    `| 重要度 | **${severityLabel_(f.severity)}** ${severityEmoji_(f.severity)} |`,
    `| CVE / Rule ID | \`${f.cve || f.ruleId}\` |`,
    `| 影響範囲 | \`${f.package || f.file}${f.startLine ? `:${f.startLine}` : ''}\` |`,
    `| 影響バージョン | ${f.affectedVersions || '—'} |`,
    `| 修正版 | ${f.fixVersions || '（未確認）'} |`,
    `| スキャン種別 | ${f.scanType} |`,
    `| 期限 | **${dueStr}** |`,
    `| Detection ID | \`${f.fingerprint}\` |`,
    '',
    '## 関連リンク',
    '',
    f.runUrl ? `- [Workflow Run](${f.runUrl})` : '',
    f.link ? `- [Advisory](${f.link})` : '',
    f.prRef ? `- 起源 PR ref: \`${f.prRef}\`` : '',
    '',
    '## 対応手順',
    '',
    '1. 影響範囲のコード／依存を確認',
    '2. 修正版へバンプ or パッチ',
    '3. PR を作成 → CI / Codex Review',
    '4. マージ後、再スキャンで Detection ID が消えたことを確認',
    '5. この Issue を Close → 台帳が `closed` に自動遷移',
    '',
    '## 期限超過時の動作',
    '',
    `期限 (${dueStr}) を過ぎても Open のままの場合、週次サマリの \`overdue\` カウンタに含まれます。`,
    '',
    '---',
    '',
    '_security-workflows により自動生成 ([source](https://github.com/Tozando-Develop-Team/security-workflows))_',
  ];
  return lines.filter((x) => x !== null && x !== undefined).join('\n');
}
