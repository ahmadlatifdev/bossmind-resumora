# BossMind closed-loop result tracking + production reality gate

This document maps the **maximum enforceable inside the repo** to your desired **request → patch → build → deploy → live verify → lock** loop, and names what **must stay in CI / hosting / human policy** so we never ship blind auto-redeploy or unsupervised auto-merge.

## What the repository enforces today

| Stage | Mechanism |
|--------|-----------|
| Request / intent | Human + issue/PR; optional Neon row via `bossmind:closed-loop:record` |
| Patch | Code review; `.cursor/rules` + protected surfaces |
| Build / lint | `npm run bossmind:deploy:gate`, `npm run bossmind:validate`, CI workflows |
| Design lock / checksums | `npm run bossmind:locked-production:verify`, `bossmind:immutable:verify`, baseline seal |
| “Live matches intent” (structural) | `BOSSMIND_IMMUTABLE_PROBE_ORIGIN` on locked verify; footer anti-drift in `lib/orchestration/bossmind-footer-live-drift.js` |
| **Production reality gate** | `npm run bossmind:reality:gate` — build (optional skip) → locked verify → optional HTTPS live home + footer probe + `/api/health` |
| Audit trail in Neon | `task_state`, `event_log`, `deployment_history` via `lib/shared/neon-memory.js`; `bossmind:closed-loop:record` |

## New scripts (closed-loop bookkeeping + gate)

### `npm run bossmind:closed-loop:record`

Writes a checkpoint to Neon when `NEON_DATABASE_URL` is set. If the URL is missing, prints JSON and exits **0** (no CI break).

Example:

```bash
node scripts/bossmind-closed-loop-record.mjs --task-id=feat-pricing-20260510 --status=verified \
  --commit="$(git rev-parse HEAD)" --live-url=https://resumora.net --routes=/,/pricing \
  --notes="Reality gate passed" --screenshot-after="https://…/after.png"
```

Flags: `--task-id`, `--status`, `--commit`, `--live-url`, `--routes` (comma-separated), `--notes`, `--screenshot-before`, `--screenshot-after`, `--affected` (comma-separated paths).

### `npm run bossmind:reality:gate`

Order:

1. `next build` unless `BOSSMIND_REALITY_SKIP_BUILD=1`.
2. `bossmind:locked-production:verify` with `BOSSMIND_IMMUTABLE_PROBE_ORIGIN` derived from `BOSSMIND_IMMUTABLE_PROBE_ORIGIN`, or `BOSSMIND_REALITY_LIVE_URL`, or (if `BOSSMIND_IMMUTABLE_PROBE_FROM_LOCK=1`) `getSiteUrl()` from `lib/marketing/seo-config.js`.
3. If `BOSSMIND_REALITY_LIVE_URL` is set (HTTPS only): fetch `/`, run `assertApprovedFooterInHtml`, fetch `/api/health` and require `"ok":true`.
4. If `BOSSMIND_CLOSED_LOOP_RECORD=1` and `BOSSMIND_CLOSED_LOOP_TASK_ID` is set: run `bossmind-closed-loop-record.mjs` with `verified` and optional commit from `GITHUB_SHA` / `RENDER_GIT_COMMIT`.

**This script does not** patch code, clear Render caches, or trigger deploys. Those require credentials and explicit governance.

## What cannot be fully automated from this repo alone

- **Deploy / redeploy / clear build cache** — needs Render (or Railway) API tokens and a deliberate workflow (often human approval after diff review).
- **Per-deploy screenshots compared to a golden image** — needs a screenshot runner (Playwright/Puppeteer), artifact storage, and baseline image policy; the schema already includes `screenshot_analysis_log` for future indexing.
- **“Retry until fixed” on the codebase** — only an agent or human with repo write + tests can do that safely; CI can retry **flaky network** steps, not silent code edits.

Recommended pattern: **GitHub Action or Render hook** runs `npm run bossmind:reality:gate` with secrets `NEON_DATABASE_URL`, `BOSSMIND_REALITY_LIVE_URL=https://…`, optional recording env vars. On failure, notify and block promotion — do not auto-merge fixes without review.

## “No false completion” policy

Treat a task as **done** only when:

1. `bossmind:deploy:gate` (or equivalent) passed on the shipping commit.
2. `bossmind:reality:gate` passed with production URL set (footer + health checks).
3. Optional: `bossmind:closed-loop:record` wrote `verified` + deployment row.
4. `bossmind:baseline:seal` (or your release process) updated the sealed baseline when UI changed by design.

Immutable lock after success remains **`bossmind:locked-production:verify`** + sealed baseline JSON / runtime authority — not a second hidden “complete” flag inside the app.

## Optional CI workflow

See `.github/workflows/bossmind-production-reality-gate.yml` (`workflow_dispatch`). Configure repository secrets as needed.
