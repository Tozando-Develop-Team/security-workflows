# security-workflows

A drop-in **GitHub Actions reusable pipeline** for vulnerability scanning across multiple repositories in a single organization.

- **100% free OSS stack** (no GHAS / Snyk / Semgrep Pro required)
- **Multi-channel routing**: Google Chat + Email + GitHub Issues + Google Sheets ledger
- **Severity-aware**: Critical/High = immediate, Medium = weekly summary, Low = ledger only
- **Tamper-resistant**: All third-party Actions are pinned to full commit SHAs

## What it scans

For every consumer repository the pipeline runs:

| Role | Tool | Why |
|---|---|---|
| Dependency updates | **Dependabot** | GitHub-native, auto PRs |
| Dependency CVEs | **OSV-Scanner** | Google's OSV.dev database lookup |
| SAST (patterns) | **Semgrep OSS** | 2,000+ community rules, ~10 s on PR diff |
| Secrets in code/history | **gitleaks** | OSS, 100+ built-in detectors |
| IaC / Containers | **Trivy** | Aqua OSS, Dockerfile + IaC + filesystem |

### Laravel / PHP add-on

| Tool | Role |
|---|---|
| `composer audit` (built-in to Composer 2.4+) | composer.lock CVE check |
| **Psalm** with `--taint-analysis` | OSS taint-flow SAST — closest free analogue to CodeQL |
| **Larastan** | Framework-aware static analysis |
| **PHPCS Security Audit** | Pattern-based PHP security rules |

### Next.js / TypeScript add-on

| Tool | Role |
|---|---|
| `npm audit` (built-in) | package-lock.json CVE check |
| `eslint-plugin-security` | `eval`, RegExp pitfalls, etc. |
| `eslint-plugin-no-unsanitized` | `dangerouslySetInnerHTML`, document.write |

## Architecture

```
┌─────────────────┐   uses:    ┌──────────────────────┐
│ Consumer repo   │ ─────────► │ pr-scan.yml          │
│ (PR or weekly)  │            │ weekly-scan.yml      │
└─────────────────┘            │ (this repo)          │
                               └─────────┬────────────┘
                                         │ SARIF / audit JSON
                                         │ + HMAC-SHA256 signature
                                         ▼
                               ┌──────────────────────┐
                               │ Apps Script Web App  │
                               │ (security-router)    │
                               └─┬────────┬──────────┬┘
                                 │        │          │
                Critical / High  │  All severities   │
                                 ▼        ▼          ▼
                          Google Chat  Sheets    GitHub Issue
                            + Email   (ledger)  (Critical/High only)
                                                + Monday 09:00 weekly summary
```

## Severity routing

| Severity | Channel | SLA |
|---|---|---|
| 🔴 **Critical** (CVSS 9.0+) | Chat immediate + Email + auto-Issue | 24 h |
| 🟠 **High** (CVSS 7.0–8.9) | Chat immediate + Email + auto-Issue | 48 h |
| 🟡 **Medium** (CVSS 4.0–6.9) | Sheets ledger + Monday 09:00 JST summary | 7 d |
| ⚪ **Low** (CVSS 0.1–3.9) | Sheets ledger only | 30 d |

De-duplication uses a SHA-256 fingerprint over `(project, repo, scan_type, rule_id, file, line)` to avoid alert spam across PRs and weekly runs.

## Repository layout

```
.
├── .github/
│   ├── workflows/
│   │   ├── pr-scan.yml          # called from consumer repos at PR time
│   │   └── weekly-scan.yml      # called from consumer repos by cron
│   └── scripts/
│       ├── post-sarif.sh        # SARIF → Apps Script (HMAC-signed)
│       └── post-audit.sh        # composer/npm audit → Apps Script
├── apps-script/                 # Apps Script Web App source
│   ├── appsscript.json
│   ├── main.gs                  # doPost entry, HMAC verification
│   ├── router.gs                # severity routing
│   ├── chat.gs                  # Google Chat Cards v2
│   ├── sheets.gs                # ledger upsert / markResolved
│   ├── issue.gs                 # GitHub Issues REST
│   ├── email.gs                 # MailApp for Critical / High
│   ├── weekly.gs                # Monday summary + time trigger
│   └── README.md                # deploy guide (clasp / manual)
├── templates/consumer/          # drop-in files for consumer repos
│   ├── security-pr.yml
│   ├── security-weekly.yml
│   ├── dependabot-laravel.yml
│   ├── dependabot-nextjs.yml
│   └── eslint-security.config.cjs
└── docs/
    ├── deployment-guide.md      # adopt this in 15 minutes
    └── runbook.md               # what to do when an alert fires
```

## Adoption

See [`docs/deployment-guide.md`](./docs/deployment-guide.md). Per consumer repo: drop 3 files in `.github/`, register two organization-level Secrets (`APPS_SCRIPT_URL` + `APPS_SCRIPT_KEY`), open a PR.

## Design rationale (why this stack vs. paid alternatives)

- **CodeQL is replaced by Semgrep OSS + Psalm taint + ESLint security plugin.**
  On the OWASP Benchmark, Semgrep alone scores F1 = 69.4 % vs. CodeQL's 74.4 % — a 5-point gap that the additional layers close in practice. LinkedIn publicly switched to a CodeQL + Semgrep two-tool pipeline in 2026 ([InfoQ](https://www.infoq.com/news/2026/02/linkedin-redesigns-sast-pipeline/)), validating the dual-tool approach.
- **All Actions are pinned to full commit SHAs.**
  Required after the 2026-03 Trivy GitHub Action supply chain incident ([The Hacker News](https://thehackernews.com/2026/03/trivy-security-scanner-github-actions.html)) — pinning by tag is not enough; only SHAs are immutable.
- **HMAC-SHA256 between GitHub Actions and Apps Script.**
  Replaces the need for service accounts / OAuth between CI and the notification router. Shared secret lives in two places: GitHub Org Secret + Apps Script Property.

## License

MIT — see [LICENSE](./LICENSE).
