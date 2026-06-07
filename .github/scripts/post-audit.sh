#!/usr/bin/env bash
# post-audit.sh: composer audit / npm audit の JSON 結果を Apps Script へ POST
# 使い方: post-audit.sh <audit_json> <project_label> <scan_type> <apps_script_url> <hmac_key>
set -euo pipefail

AUDIT_FILE="${1:?audit json required}"
PROJECT="${2:?project label required}"
SCAN_TYPE="${3:?scan type required}"
URL="${4:?apps script url required}"
KEY="${5:?hmac key required}"

if [[ ! -f "$AUDIT_FILE" ]]; then
  echo "[post-audit] $AUDIT_FILE が見つからないのでスキップ"
  exit 0
fi

# scan_type で形式を切り替え (composer vs npm)
case "$SCAN_TYPE" in
  composer-audit|weekly-composer-audit)
    findings=$(jq -c '[
      (.advisories // {}) | to_entries[] | {
        package: .key,
        ruleId: (.value[0].cve // .value[0].advisoryId // "composer-audit"),
        title: (.value[0].title // ""),
        severity: (.value[0].severity // "unknown"),
        cve: (.value[0].cve // ""),
        affected_versions: (.value[0].affectedVersions // ""),
        link: (.value[0].link // ""),
        fix_versions: (.value[0].fixedIn // "")
      }
    ]' "$AUDIT_FILE")
    ;;
  npm-audit|weekly-npm-audit)
    findings=$(jq -c '[
      (.vulnerabilities // {}) | to_entries[] | {
        package: .key,
        ruleId: (.value.via[0].source // .key),
        title: ((.value.via[0].title) // ""),
        severity: (.value.severity // "unknown"),
        cve: ((.value.via[0].cve) // ""),
        affected_versions: (.value.range // ""),
        link: ((.value.via[0].url) // ""),
        fix_versions: ((.value.fixAvailable.version) // "")
      }
    ]' "$AUDIT_FILE")
    ;;
  *)
    findings="[]"
    ;;
esac

payload=$(jq -c -n \
  --arg project "$PROJECT" \
  --arg scan_type "$SCAN_TYPE" \
  --arg repo "${GITHUB_REPOSITORY:-unknown}" \
  --arg run_url "${GITHUB_SERVER_URL:-https://github.com}/${GITHUB_REPOSITORY:-unknown}/actions/runs/${GITHUB_RUN_ID:-0}" \
  --argjson findings "$findings" \
  '{
    event: "scan_result",
    project: $project,
    scan_type: $scan_type,
    repo: $repo,
    run_url: $run_url,
    ts: (now | floor),
    findings: $findings
  }')

signature=$(printf '%s' "$payload" | openssl dgst -sha256 -hmac "$KEY" -binary | base64 -w 0)

http_code=$(curl -sS -o /tmp/post-audit.response -w "%{http_code}" \
  -X POST "$URL" \
  -H "Content-Type: application/json" \
  -H "X-Signature: $signature" \
  --max-time 30 \
  --data-binary "$payload" || echo "000")

echo "[post-audit] $SCAN_TYPE → HTTP $http_code"
[[ "$http_code" == "200" ]] || { cat /tmp/post-audit.response 2>/dev/null || true; }
