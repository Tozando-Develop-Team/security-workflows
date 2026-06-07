#!/usr/bin/env bash
# post-sarif.sh: SARIF を Apps Script Web App に HMAC 署名つきで POST
# 使い方: post-sarif.sh <sarif_file> <project_label> <scan_type> <apps_script_url> <hmac_key>
set -euo pipefail

SARIF_FILE="${1:?sarif file required}"
PROJECT="${2:?project label required}"
SCAN_TYPE="${3:?scan type required}"
URL="${4:?apps script url required}"
KEY="${5:?hmac key required}"

if [[ ! -f "$SARIF_FILE" ]]; then
  echo "[post-sarif] $SARIF_FILE が見つからないのでスキップ"
  exit 0
fi

# SARIF をそのまま送ると Apps Script の Web App 上限 (50MB) に当たり得るので
# 検出結果の最低限のメタ情報だけ抜き出して送る。
payload=$(jq -c \
  --arg project "$PROJECT" \
  --arg scan_type "$SCAN_TYPE" \
  --arg repo "${GITHUB_REPOSITORY:-unknown}" \
  --arg run_url "${GITHUB_SERVER_URL:-https://github.com}/${GITHUB_REPOSITORY:-unknown}/actions/runs/${GITHUB_RUN_ID:-0}" \
  --arg pr "${GITHUB_EVENT_NAME:-unknown}#${GITHUB_REF_NAME:-unknown}" \
  '{
    event: "scan_result",
    project: $project,
    scan_type: $scan_type,
    repo: $repo,
    run_url: $run_url,
    pr_ref: $pr,
    ts: (now | floor),
    findings: [
      .runs[]?.results[]? | {
        ruleId: .ruleId,
        level: (.level // "warning"),
        message: (.message.text // .message.markdown // ""),
        file: ((.locations[0]?.physicalLocation?.artifactLocation?.uri) // ""),
        startLine: ((.locations[0]?.physicalLocation?.region?.startLine) // 0),
        severity: (.properties.severity // (.level // "warning"))
      }
    ]
  }' "$SARIF_FILE")

# HMAC-SHA256 で署名
signature=$(printf '%s' "$payload" | openssl dgst -sha256 -hmac "$KEY" -binary | base64 -w 0)

# POST (失敗しても CI を落とさない: || true で呼ばれる前提)
http_code=$(curl -sS -o /tmp/post-sarif.response -w "%{http_code}" \
  -X POST "$URL" \
  -H "Content-Type: application/json" \
  -H "X-Signature: $signature" \
  --max-time 30 \
  --data-binary "$payload" || echo "000")

echo "[post-sarif] $SCAN_TYPE → HTTP $http_code"
[[ "$http_code" == "200" ]] || { cat /tmp/post-sarif.response 2>/dev/null || true; }
