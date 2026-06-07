# Deployment Guide

Adopt this pipeline in any new repository. Per repo: **15–30 minutes**.

## Prerequisites

- This repository (`security-workflows`) is reachable from the consumer repo (either Public, or Private with org-level reusable-workflow access enabled).
- Two organization-level GitHub Secrets registered:
  - `APPS_SCRIPT_URL` — the Apps Script Web App URL (from the `apps-script/` README)
  - `APPS_SCRIPT_KEY` — the HMAC shared secret (same value as the Apps Script `HMAC_KEY` property)
- The Apps Script Web App has been deployed (see `apps-script/README.md`).
- The Google Chat space and Sheets ledger have been created.

## Steps

### 1. Pick a stack

| Stack value | When to use |
|---|---|
| `laravel` | Laravel application (Composer + optional npm assets) |
| `nextjs` | Next.js / React (Node + npm) |
| `static` | Static site or thin codebase (dependency scan only) |

### 2. Drop in 3–5 files

Place into the consumer repository at the indicated paths:

| File | Source template | Notes |
|---|---|---|
| `.github/workflows/security-pr.yml` | `templates/consumer/security-pr.yml` | required |
| `.github/workflows/security-weekly.yml` | `templates/consumer/security-weekly.yml` | required |
| `.github/dependabot.yml` | `templates/consumer/dependabot-{laravel,nextjs}.yml` | required (pick variant) |
| `.eslintrc.security.cjs` | `templates/consumer/eslint-security.config.cjs` | Next.js stack only |
| `psalm.xml` | (run `./vendor/bin/psalm --init`) | Laravel stack only |

**Placeholders to replace** in the workflow templates:

- `<STACK>` → `laravel` / `nextjs` / `static`
- `<PROJECT_LABEL>` → a short identifier for the project (used in Chat cards and Sheets rows)
- `<SHA>` → the latest commit SHA of `security-workflows` (tags must not be used — pin to SHA)

### 3. (Next.js only) install dev dependencies

```bash
npm i -D eslint @typescript-eslint/parser \
  eslint-plugin-security eslint-plugin-no-unsanitized
```

### 4. (Laravel only) Psalm config

```bash
composer require --dev vimeo/psalm
./vendor/bin/psalm --init
```

Inspect the generated `psalm.xml`. The default `findUnusedCode="false"` is recommended.

### 5. Open a PR

- Branch: `feat/security-workflows`
- Commit subject: `feat: enable security scanning via reusable workflows`
- Reviewer: project owner

The PR's `security-pr.yml` job will fire immediately. If existing dependencies have known CVEs, **expect Critical/High notifications shortly after the PR is opened**.

### 6. Verify

| Check | Where | Expected |
|---|---|---|
| `Security (PR)` workflow finishes | Actions tab | green within ~5 minutes |
| First Critical/High notification | Google Chat space | card with severity, CVE, affected version, fix version |
| Ledger appended | Google Sheets `findings` tab | new row(s) per finding |
| Auto Issue (only if Critical/High found) | Issues tab | template-formatted, labeled `security` |

### 7. Optional: synthetic vulnerability test

To confirm end-to-end wiring without waiting for a real CVE, you can temporarily commit a known-vulnerable package version on a throwaway branch (e.g. an old `lodash` version with a published CVE), open a PR, observe the notification, then close the PR.

## Rollout sequencing

Adopt one repository at a time, starting with the project that has the largest dependency tree (the first scan is usually the noisiest — fix or triage the noise before moving on). Wait 24 hours between repositories to monitor for false positives; suppress them with `.semgrepignore` / `.gitleaksignore` / `osv-scanner.toml` as needed before the next rollout.

## Operating cadence

| Cadence | What runs | Configurable in |
|---|---|---|
| Every PR | full diff scan (Semgrep + OSV + gitleaks + Trivy + stack-specific) | `security-pr.yml` |
| Every Monday 09:00 JST | full-tree scan of existing dependencies | `security-weekly.yml` cron |
| Every weekday morning | (none — daily summary is intentionally not in this pipeline; weekly cadence is the design choice) | — |

## See also

- [`docs/runbook.md`](./runbook.md) — what to do when an alert fires.
- [`apps-script/README.md`](../apps-script/README.md) — how to deploy or update the Apps Script router.
