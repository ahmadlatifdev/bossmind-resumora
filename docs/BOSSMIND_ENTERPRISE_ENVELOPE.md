# BossMind Enterprise Envelope

Single entrypoint that **chains existing** BossMind protection and validation scripts, writes an **append-only local ledger** (`.bossmind/ledger/enterprise-envelope.jsonl`), and emits a **Neon `event_log`** row when `NEON_DATABASE_URL` is set.

## Commands

| Command | Purpose |
|---------|---------|
| `npm run bossmind:enterprise:envelope` | Full envelope (see phases below) |
| `npm run bossmind:enterprise:envelope:dry` | Print planned phases only |
| `npm run bossmind:enterprise:risk` | Heuristic pre-deploy risk score (0–100) |

## Phases (default)

1. `bossmind-predictive-runtime-risk.mjs` — local heuristic, not ML  
2. `bossmind-hosting-guard.mjs`  
3. `bossmind-protected-surface-verify.mjs`  
4. `bossmind-antileak-guard.mjs` (unless `BOSSMIND_SKIP_ANTILEAK=1`)  
5. `bossmind-env-keys-audit.mjs` — key *names* from `config/bossmind-env-structure.example.txt`  
6. `scripts/stripe-env-validation.js` (unless `BOSSMIND_ENVELOPE_SKIP_STRIPE=1`)  
7. `npm run validate:deps`  
8. `bossmind-runtime-sync.mjs --once`  
9. `bossmind-reconciliation-engine.mjs`  
10. `bossmind-monitor-health.mjs`  
11. `bossmind-preservation-validate.mjs` — only if backup manifest exists and skip not set  

## Optional env

| Variable | Effect |
|----------|--------|
| `BOSSMIND_ENVELOPE_EXTENDED=1` | Adds perf-scan, ui-probe, ui-baseline, immutable-verify, orchestration-audit |
| `BOSSMIND_ENVELOPE_RUN_DEPLOY_GATE=1` | Runs full `bossmind-deploy-gate.mjs` (heavy) |
| `BOSSMIND_ENVELOPE_SKIP_PRESERVATION=1` | Skip preservation validate |
| `BOSSMIND_ENVELOPE_SKIP_STRIPE=1` | Skip Stripe env script |
| `BOSSMIND_ENVELOPE_ENFORCE_RISK=1` | Fail envelope when risk script exits `2` (high risk) |
| `BOSSMIND_ENV_KEYS_STRICT=1` | Env key audit fails if any expected key missing |
| `BOSSMIND_AUTONOMOUS_ENTERPRISE_EVERY_CYCLES=N` | From `bossmind-autonomous-runtime.mjs`, run **light** envelope every N cycles with `--from-autonomous` |

## Honest boundaries

- **No** automatic GitHub/Railway/Render revision reconciliation without platform APIs and tokens.  
- **No** autonomous production deploy or rollback from this script alone.  
- **Visual “AI” QA** = baseline + HTTP probes in-repo; not a separate vision model.  
- **Multi-agent parallelism** = Neon `SKIP LOCKED` supervisor workers + optional multiple Railway processes.

Layer map: `config/bossmind-enterprise-envelope.json`.  
**Full ecosystem matrix (honest status per layer):** `docs/BOSSMIND_ENTERPRISE_COVERAGE_MATRIX.md` · **Evidence report:** `npm run bossmind:enterprise:coverage`
