# Resumora Automation & Performance Health Scorecard

**Project:** `resumora-live` / `ahmadlatifdev/bossmind-resumora`  
**Generated:** 2026-08-29 (America/Toronto) — post optimization pass  
**Companion:** `docs/AUTOMATION_OPTIMIZATION_REPORT.md`  
**Secrets:** key names / SET|EMPTY only — no secret values printed

---

## Task 1 — Build & deployment metrics

### deploy-prod.yml (last 30 / 12 completed)

| Metric           |       Value |
| ---------------- | ----------: |
| Success          |           0 |
| Failure          |          12 |
| **Success rate** |      **0%** |
| Average duration | **234.4 s** |
| Median duration  |    **30 s** |

### Broader Actions sample (~40 recent runs)

| Workflow                            |   N | Success rate | Avg sec |
| ----------------------------------- | --: | -----------: | ------: |
| Deploy Staging (Blue-Green Preview) |   7 |         100% |      48 |
| Self-Heal Tests                     |   5 |         100% |      41 |
| Security Audit                      |   4 |         100% |      26 |
| Daily Health Report                 |   1 |         100% |      28 |
| pages-build-deployment              |   3 |         100% |      43 |
| Deploy Firebase Hosting Production  |   6 |       **0%** |     335 |
| Deploy Firebase Hosting Preview     |   4 |       **0%** |      25 |
| Auto Changelog                      |   3 |           0% |       8 |
| UI Consistency (SSoT Chrome)        |   1 |           0% |      51 |

**Flakiness:** still dominated by empty `FIREBASE_SERVICE_ACCOUNT` (infra), not app code.

**CI speed opts shipped:** `actions/cache` for `node_modules` (+ Playwright browsers on UI regression).

---

## Task 2 — Runtime automation (`selfHeal.js`)

| Dimension                                   | Status                                                                      |
| ------------------------------------------- | --------------------------------------------------------------------------- |
| First-time-fix rate (7d logs, pre-redeploy) | **~0%** — 200/200 `impaired`, score ~40, `executed=0`                       |
| Circuit breaker                             | **Tuned:** 15m window, half-open after 30m, `remediationAttempts` cap 2/24h |
| Approval flap                               | **Deduped** pending by `actionId`                                           |
| Env drift                                   | **Preemptive fingerprint** (shape only); suppress stable re-trips           |
| Safe allowlist                              | Unchanged — secrets/IAM/deploy remain HITL                                  |

Redeploy `selfHealMonitor` via CI after SA bootstrap to activate runtime tuning.

---

## Task 3 — API & secrets

| Endpoint                           | Result                 | Latency |
| ---------------------------------- | ---------------------- | ------: |
| `GET /api/client-dashboard`        | 200 (alive)            | ~954 ms |
| `GET /api/create-checkout-session` | 405 (expected for GET) | ~251 ms |

| Secret                                | State                               |
| ------------------------------------- | ----------------------------------- |
| GitHub `FIREBASE_SERVICE_ACCOUNT`     | name present, **value EMPTY in CI** |
| GitHub `VERCEL_TOKEN`                 | leftover — delete                   |
| Secret Manager Stripe/Bilibili/Resend | names present                       |

Bootstrap: `scripts/bootstrap-secrets.ps1` / `master-pipeline.ps1 -Mode BootstrapOnly`.

---

## Task 4 — Scoring sheet

| Category                                  |   Score | Grade  | Basis                                                               |
| ----------------------------------------- | ------: | :----: | ------------------------------------------------------------------- |
| Build & Release Stability                 | **45%** | **F**  | Prod deploy still 0/12; caches ready                                |
| Self-Healing Effectiveness                | **58%** | **D+** | Anti-flap code shipped; runtime still impaired until redeploy + env |
| User Experience (API)                     | **74%** | **C**  | Endpoints alive; dashboard cold path                                |
| External Pipeline (Media)                 | **35%** | **D-** | Unchanged observability gap                                         |
| Guardrail Compliance (Zero Manual Deploy) | **78%** | **C+** | Orchestrator + caches; emergency gitignored                         |

### Average System Automation Rate

**~62%** actual now · **~90% projected** after non-empty SA + merge/redeploy (see optimization report).

### Top bottlenecks

1. Empty GitHub `FIREBASE_SERVICE_ACCOUNT`
2. Self-heal env drift HITL (correct) — needs fingerprint deploy to stop noise
3. Media/publish observability still thin; `generategooglevideo` maxScale=20 over-wide

---

_Evidence: `gh` Actions API, Cloud Logging `selfhealmonitor`, live HTTP probes, code audit of `functions/selfHeal.js`._
