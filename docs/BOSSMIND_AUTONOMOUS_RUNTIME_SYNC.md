# BossMind Autonomous Runtime Sync

Production-safe runtime synchronization layer for Resumora.

## What it enforces

- Shared-memory authority key: `luxury_ui_baseline` in Neon table `runtime_authority`
- Protected baseline fingerprint from:
  - `config/bossmind-protected-surface.json`
  - Luxury route/shell files (`HomePage.jsx`, `SiteChrome.js`, EN/FR copy/context, global CSS)
- Runtime probe authority:
  - `/` must include luxury sections: `top`, `trust`, `home-intake`, `pricing`
  - `/client` must redirect to `/`

## Loop

`scripts/bossmind-runtime-sync.mjs` runs:

Detect -> Compare -> Diagnose -> Repair -> Verify -> Lock

- Detects:
  - Missing protected files
  - Baseline hash mismatch against shared memory
  - Runtime route/render drift
- Auto-heals (safe):
  - `node scripts/clean-next-cache.mjs`
  - `npm run build`
  - Re-probe runtime
- Persists:
  - Local status: `.bossmind/runtime-sync/status.json`
  - Neon event/task logs + deployment history status

## Commands

```bash
npm run validate:hosting
npm run bossmind:runtime:sync:once
npm run bossmind:runtime:sync:dry
npm run bossmind:runtime:sync
npm run bossmind:autonomous:runtime:once
npm run bossmind:autonomous:runtime
npm run bossmind:reconcile
```

`validate:hosting` is a hard policy gate: it blocks Vercel env/config/guidance unless `BOSSMIND_ALLOW_VERCEL=1` is explicitly set.

## Status API

- `GET /api/orchestration/runtime-sync-status`
- Returns local status + Neon authority/events/tasks
- Auth: development, `BOSSMIND_DIAGNOSTICS=1`, or Bearer `BOSSMIND_ORCHESTRATION_SECRET`

## Protection manifest (single active luxury baseline)

- `config/bossmind-protected-ui-authority.json` — canonical `HomePage.jsx`, required HTML markers (hero, trust, intake, pricing, navy/gold CSS tokens), fingerprint extras.
- `lib/orchestration/bossmind-interface-authority.js` — structural checks:
  - single `HomePage.jsx` under `components/`
  - `pages/index.js` imports canonical module (no minimal/pricing-only bootstrap)
  - no App Router `app/**/page.*` colliding with `pages/`

## Scores (observability)

Each sync cycle computes **0–100** metrics including:

- `compositeAutonomyScore` — target default **90+** (`BOSSMIND_AUTONOMY_MIN_SCORE`)
- `productionReconciliationScore`, `enterpriseOrchestrationScore` — autonomy rollup using reconcile score + probes (`bossmind-interface-authority`); snapshot also exposes `alignmentBlend` in reconcile JSON
- `runtimeSynchronizationScore`, `driftProtectionScore`, `deploymentIntegrityScore`, `protectedBaselineLockScore`, `memoryAuthorityScore`, `routeAuthorityScore`

Dashboard: **`/runtime-sync`** (reads `GET /api/orchestration/runtime-sync-status`).

## Production reconciliation engine

Continuous comparison across workspace Git HEAD, Neon `runtime_authority` baseline hash, `last_confirmed_checkpoint`, structural lock, and the live runtime probe:

- Persisted snapshot: `.bossmind/reconciliation/status.json`
- Each `bossmind-runtime-sync` cycle merges **live** probe + fingerprint (no reliance on stale local files)
- `npm run bossmind:reconcile` — standalone reconcile (writes the same snapshot; optional webhook)

Env:

- `BOSSMIND_RECONCILE_STRICT_CHECKPOINT` — set to `0` to ignore HEAD vs checkpoint mismatch during local iteration (default: strict compare)
- `BOSSMIND_RECONCILE_DEPLOY_HOOK_URL` — when set, a **successful** reconcile may `POST` a small JSON promote signal (`BOSSMIND_RECONCILE_DEPLOY_HOOK_MIN_SCORE`, default **95**)
- `BOSSMIND_RECONCILE_STRICT_EXIT=1` on `bossmind:reconcile` — exit non-zero if any non-`low` mismatch remains

Unreachable dev server (`ECONNREFUSED` / timeout) is scored as **low** severity so autonomy metrics can remain high when structure + Neon baseline still align (`computeAutonomyScores` partial credit). The reconcile snapshot includes a separate **`alignmentBlend`** metric (different from dashboard `enterpriseOrchestrationScore`).

## Neon authority promotion

When runtime probes pass, structure is valid, **and reconciliation reports `ok`**, the sync loop **upserts** `runtime_authority` with the current baseline hash (`BOSSMIND_AUTHORITY_PROMOTE_ON_VERIFY`, default on). Disable with `BOSSMIND_AUTHORITY_PROMOTE_ON_VERIFY=0` if you must compare without updating memory.

## Deploy governance (pre-release)

```bash
npm run bossmind:deploy:gate
```

Runs hosting policy → protected surface → **immutable luxury baseline verify** (`bossmind:immutable:verify`) → anti-leak → lint → build → optional `bossmind:ui-probe` if `BOSSMIND_DEPLOY_GATE_UI_PROBE=1`. Skip lint only if needed: `BOSSMIND_DEPLOY_GATE_SKIP_LINT=1`. Skip immutable gate only if needed: `BOSSMIND_DEPLOY_GATE_SKIP_IMMUTABLE=1`.

**Immutable baseline:** `config/bossmind-immutable-production-baseline.json` + `config/bossmind-baseline-snapshots/luxury-v1/`. Seal after approved UI work: `npm run bossmind:baseline:seal`. Runtime sync can auto-restore from snapshots when `BOSSMIND_AUTO_RESTORE_IMMUTABLE=1`.

## Heal strategy (optimized)

1. Clear `.next` (`clean-next-cache`)
2. Re-probe; if still failing → `npm run build` → re-probe  
   Baseline-only drift (hash vs Neon) does **not** trigger rebuild — memory is updated after successful verification.

## Dry-run exit semantics

`--dry-run` validates **manifest + structural + fingerprint** only; exits **1** only if files are missing or structural lock fails (server need not be running).

## Full continuous activation (one active architecture)

Use `bossmind:autonomous:runtime` as the single continuously active controller.  
Each loop executes:

1. `bossmind-runtime-sync --once`
2. `bossmind-supervisor-worker --once`
3. `bossmind-monitor-health`
4. periodic `bossmind-deploy-gate` (every N cycles)

State:

- `.bossmind/autonomous-runtime/status.json`
- `.bossmind/autonomous-runtime/history.jsonl`

Neon heartbeat task:

- `task_state(project_key=resumora, task_key=bossmind_autonomous_runtime)`

Control env:

- `BOSSMIND_AUTONOMOUS_LOOP_MS` (default `60000`)
- `BOSSMIND_DEPLOY_GATE_EVERY_CYCLES` (default `20`)
- `BOSSMIND_AUTONOMOUS_RUN_DEPLOY_GATE` (`1`/`0`)

## Continue From Last Confirmed Update Point (permanent strategy)

BossMind now persists a locked continuity checkpoint and loads it before runtime/deploy cycles:

- Neon authority table: `last_confirmed_checkpoint` (`checkpoint_key=global_continuity`)
- Local fallback: `.bossmind/continuity/last-confirmed-point.json`

Load flow:

1. Load latest confirmed checkpoint (Neon first, local fallback)
2. Validate against active runtime/baseline authority
3. Continue execution from that point (no context rebuild loops)

Save flow:

- After healthy runtime cycles, checkpoint is updated and relocked with:
  - latest `gitHead`
  - latest protected baseline hash
  - latest sync/heal metrics

Commands:

```bash
npm run bossmind:continuity:status
npm run bossmind:autonomous:runtime
```

## Safety

- No destructive git commands
- No `.git` mutation
- No source-file deletion
- Cache cleanup only removes `.next`

## See also

- **Preservation, 30-day rolling backup, recovery:** `docs/BOSSMIND_PRESERVATION_AND_BACKUP.md`
