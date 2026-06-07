/**
 * chat.gs — Google Chat スペースへの通知 (Cards v2)
 */

function sendChatCard_(f) {
  const webhook = PROP.getProperty('GOOGLE_CHAT_WEBHOOK');
  if (!webhook) {
    Logger.log('GOOGLE_CHAT_WEBHOOK not set, skipping chat');
    return;
  }

  const emoji = severityEmoji_(f.severity);
  const sevLabel = severityLabel_(f.severity);

  const card = {
    cardsV2: [{
      cardId: f.fingerprint,
      card: {
        header: {
          title: `${emoji} [${sevLabel}] ${f.project}`,
          subtitle: f.title || f.ruleId,
          imageUrl: 'https://www.gstatic.com/images/icons/material/system/2x/security_black_48dp.png',
          imageType: 'CIRCLE',
        },
        sections: [
          {
            header: '検出内容',
            widgets: [
              kv_('CVE / Rule', f.cve || f.ruleId),
              kv_('重要度', sevLabel),
              kv_('影響範囲', `${f.package || f.file}${f.startLine ? ` : ${f.startLine}` : ''}`),
              kv_('修正版', f.fixVersions || '（未確認）'),
              kv_('影響バージョン', f.affectedVersions || '—'),
              kv_('担当', `@${f.owner}`),
              kv_('期限', Utilities.formatDate(f.dueAt, 'Asia/Tokyo', 'yyyy-MM-dd HH:mm') + ' JST'),
            ],
          },
          {
            header: '関連リンク',
            widgets: [
              {
                buttonList: {
                  buttons: [
                    f.runUrl ? button_('Workflow Run', f.runUrl) : null,
                    f.link ? button_('Advisory', f.link) : null,
                    ledgerLinkButton_(),
                  ].filter(Boolean),
                },
              },
            ],
          },
          {
            header: 'Detection ID',
            widgets: [textParagraph_(`fingerprint: \`${f.fingerprint}\``)],
          },
        ],
      },
    }],
  };

  const resp = UrlFetchApp.fetch(webhook, {
    method: 'post',
    contentType: 'application/json; charset=UTF-8',
    payload: JSON.stringify(card),
    muteHttpExceptions: true,
  });
  Logger.log(`[chat] HTTP ${resp.getResponseCode()} fp=${f.fingerprint}`);
}

function sendChatText_(text) {
  const webhook = PROP.getProperty('GOOGLE_CHAT_WEBHOOK');
  if (!webhook) return;
  UrlFetchApp.fetch(webhook, {
    method: 'post',
    contentType: 'application/json; charset=UTF-8',
    payload: JSON.stringify({ text }),
    muteHttpExceptions: true,
  });
}

function kv_(label, value) {
  return {
    decoratedText: {
      topLabel: label,
      text: String(value == null ? '' : value),
      wrapText: true,
    },
  };
}

function textParagraph_(text) {
  return { textParagraph: { text } };
}

function button_(label, url) {
  return {
    text: label,
    onClick: { openLink: { url } },
  };
}

function ledgerLinkButton_() {
  const sid = PROP.getProperty('LEDGER_SHEET_ID');
  if (!sid) return null;
  return button_('台帳', `https://docs.google.com/spreadsheets/d/${sid}/edit`);
}
