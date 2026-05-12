# BossMind enterprise coverage matrix (Resumora repo)

This matrix is the **honest production-confirmation** map: what is **implemented and enforceable in Git**, what is **partial**, and what **requires external platforms** (Railway/Render APIs, GSC UI, OAuth). It does **not** assert “fully active” for capabilities that need credentials or human verification you have not run.

**Legend:** ✅ in-repo / scriptable · ⚠️ partial or gated · 🔌 external / operator

| # | Area | Requirement (summary) | Primary artifacts | Verify |
|---|------|-------------------------|-------------------|--------|
| 1 | Runtime authority | Drift detect + sync | `bossmind-runtime-sync.mjs`, `bossmind-reconciliation-engine.mjs`, `runtime_authority` (Neon) | `npm run bossmind:runtime:sync:once` |
| 1 | Railway/Render parity | Live deploy SHA vs Git | — | 🔌 Use platform APIs + write `deployment_history` from CI |
| 1 | Protected UI | Baseline / immutable | `bossmind-immutable-verify.mjs`, `bossmind-baseline-seal.mjs`, registry docs | `npm run bossmind:immutable:verify` |
| 1 | Rollback safety | Snapshots + restore | `bossmind-snapshot-save.mjs`, `bossmind-restore-rollback.mjs`, Neon `rollback_snapshots` | Manual + `npm run bossmind:snapshot` |
| 2 | Self-healing | Detect → repair chain | `langgraph-repair-flow.js`, `sentry-ingest`, `bossmind-self-heal.mjs` | ⚠️ Needs `BOSSMIND_ORCHESTRATION_SECRET` + worker |
| 2 | Closed-loop deploy | Auto deploy/retry | — | 🔌 CI/CD owned; gate is `bossmind-deploy-gate.mjs` |
| 2 | Checkpoints | Continuity | `bossmind-last-confirmed-point.js`, deploy gate | `npm run bossmind:continuity:status` |
| 3 | Neon authority | task_state / event_log | `neon-memory.js` | `NEON_DATABASE_URL` + supervisor |
| 3 | Reconciliation | Shared memory align | `bossmind-reconciliation-engine.mjs` | `npm run bossmind:reconcile` |
| 4 | Anti-leak | Protected paths | `bossmind-antileak-guard.mjs`, `PROTECTED_COMPONENTS_REGISTRY.md` | `npm run bossmind:antileak` |
| 4 | Boundaries | Surface lock | `bossmind-protected-surface-verify.mjs` | `npm run bossmind:protect:verify` |
| 4 | Secrets | Key-name audit | `bossmind-env-keys-audit.mjs`, `stripe-env-validation.js` | `npm run bossmind:enterprise:envelope` (includes audit) |
| 5 | Backup | Rolling 30d | `bossmind-backup-daily.mjs` | 🔌 Cron on host; `npm run bossmind:backup:daily` |
| 5 | Preservation | Hash manifest | `bossmind-preservation-validate.mjs` | Needs backup manifest first |
| 6 | Visual QA | AI vision | — | ⚠️ Baseline + probes only: `bossmind-ui-baseline-verify.mjs`, `bossmind-ui-probe.mjs` |
| 7 | SEO / Google | Sitemap, robots, schema | `seo-config.js`, `sitemap.xml.js`, `robots.txt.js`, `_document.js` | Deploy + submit sitemap in GSC |
| 7 | GSC / indexing API | Auto submit all URLs | — | 🔌 OAuth + policy; not bulk auto here |
| 8 | Marketing | Weekly + organic | `weekly-organic-pipeline.js`, `bossmind-google-organic-orchestrator.mjs`, `bossmind-marketing-activation.mjs` | `npm run bossmind:organic:growth` |
| 8 | Conversion | Engagement + pricing UI | `EngagementMomentumStrip.jsx`, `PricingPanel.jsx`, `site-copy.js` | Visual QA on `/` and `/pricing` |
| 11 | **Stripe / payments** | **Checkout + webhooks** | `pages/api/checkout.js`, `pages/api/webhooks/stripe.js`, `client-hooks.js` | `npm run bossmind:stripe:production-report` · `docs/STRIPE_PRODUCTION_VALIDATION.md` |
| 9 | Enterprise envelope | Orchestrated validation | `bossmind-enterprise-envelope.mjs`, ledger `.bossmind/ledger/` | `npm run bossmind:enterprise:envelope` |
| 9 | Predictive risk | Heuristic score | `bossmind-predictive-runtime-risk.mjs` | `npm run bossmind:enterprise:risk` |
| 9 | Multi-agent | Parallel workers | `bossmind-supervisor-worker.mjs` + Neon `SKIP LOCKED` | 🔌 Scale Railway worker replicas |
| 9 | PowerShell | Local tooling | `scripts/cursor-git-scm-diagnostics.ps1` | Windows ops |
| 10 | Stability | Autonomous loop | `bossmind-autonomous-runtime.mjs` | 🔌 Long-run on Railway |
| 10 | Activation audit | Weighted coverage | `bossmind-activation-audit.mjs` | `npm run bossmind:activation-audit` |

## Single-command “coverage report” (evidence JSON)

```bash
npm run bossmind:enterprise:coverage
```

Optional: `BOSSMIND_COVERAGE_STRICT=1` — exit non-zero if Neon is missing or critical scripts are absent.

## Policy

- **No false “all systems go”** without your env + cron + GSC steps.  
- **Protected interfaces** stay authoritative; automation must not overwrite them without checkpoint + review.
