# BossMind enterprise AI engineering + Cursor — stack map (honest boundaries)

This document **activates** a shared mental model: what this repository actually enforces vs what must live in **Cursor**, **CI**, **Render/Railway**, and **human governance**. It does **not** promise unsupervised auto-redeploy, silent auto-merge, or pixel-perfect visual AI QA without your own screenshot/Playwright pipeline and hosting credentials.

## Target hierarchy (desired)

```text
Architecture reasoning (DeepSeek / human) — out-of-repo or via your chosen API
        ↓
BossMind supervisor / workers (`bossmind:supervisor*`, orchestration APIs)
        ↓
LangGraph repair / flows (`lib/orchestration/langgraph-repair-flow.js`)
        ↓
Cursor agent (IDE) — reads AGENTS.md, `.cursor/rules`, protected registry
        ↓
Preflight + gates (this repo — scripts below)
        ↓
Build / test / deploy — GitHub Actions + Render/Railway + Neon
        ↓
Live verification + visual QA — optional probes, Playwright, human sign-off
        ↓
Immutable production lock — sealed baseline + `bossmind:locked-production:verify`
```

## What is activated **in-repo** today

| Capability | Where | Notes |
|------------|--------|--------|
| Cursor index scope | `.cursorignore` | Cuts noise from `.next`, `node_modules`, heal logs |
| Agent policy | `.cursor/rules/bossmind-resumora.mdc` | Fix-only, protected surfaces, checkpoints |
| **Enterprise preflight** | `npm run bossmind:enterprise:preflight` | Hosting + forbidden UI + protected surface + **structural authority** + immutable checksums (+ optional build) |
| Pre-merge / pre-deploy | `npm run bossmind:deploy:gate` | Checkpoint, immutable, lint, **build** |
| Task completion | `npm run bossmind:completion:gate` | Stricter “done” definition in-repo |
| Production reality | `npm run bossmind:reality:gate` | Build + lock + optional live footer/health |
| Memory / audit | Neon `task_state`, `event_log`, `deployment_history` via `lib/shared/neon-memory.js` |
| Runtime monitoring | Sentry (`@sentry/nextjs`), health routes | Not a replacement for product QA |
| Immutable UI lock | `config/bossmind-immutable-production-baseline.json`, `bossmind:baseline:seal` | Prevents accidental luxury drift |
| Closed-loop **recording** | `npm run bossmind:closed-loop:record` | Neon audit trail when URL is set |
| **Release verify (preflight + full deploy gate)** | `npm run bossmind:enterprise:release-verify` | Runs `enterprise:preflight` then `deploy:gate` (checkpoint, lint, **build**) |
| **Autonomous chain (release verify + locked production structural lock)** | `npm run bossmind:enterprise:autonomous-chain` | Strongest **pre-merge** bar in this repo without a second full build; see **`docs/BOSSMIND_ENTERPRISE_AUTONOMOUS_OPTIMIZATION.md`** |
| **Post-deploy production truth** | `npm run bossmind:enterprise:post-deploy` | Alias for `bossmind:reality:gate`; set `BOSSMIND_REALITY_LIVE_URL` for live checks |
| Runtime sync / repair | `npm run bossmind:runtime:sync:once`, `bossmind:runtime:repair`, `bossmind:reconcile` | Operator/CI; needs env + policy |
| Recovery suggest/apply | `npm run bossmind:recovery:suggest`, `bossmind:recovery:apply` | Human-gated restore paths |
| UI baseline / perf | `npm run bossmind:ui-baseline`, `bossmind:perf-scan` | Optional quality bars |

## Neon “unified memory core” (authoritative when `NEON_DATABASE_URL` is set)

Schema and helpers live in **`lib/shared/neon-memory.js`**. Tables used for orchestration and audit include (non-exhaustive):

| Table / concern | Role |
|-----------------|------|
| `task_state` | Per-task payload + status (`upsertTaskState`) |
| `event_log` | Append-only events (`saveEvent`) |
| `error_memory` | Deduplicated error fingerprints (`upsertErrorMemory`) |
| `missing_updates_log` | Tracked gaps (`saveMissingUpdate`) |
| `deployment_history` | Commits / environments (`saveDeploymentHistory`) |
| `runtime_authority` | Sealed UI authority rows (`upsertRuntimeAuthority`) |
| `rollback_snapshots` | File snapshots for recovery |
| `last_confirmed_checkpoint` | Continuity / confirmed checkpoints |

**Required behavior in practice:** agents and CI should **read** the protected registry + immutable baseline **before** large edits; Neon backs **persistence** of checkpoints and closed-loop records—it does not replace code review or hosting APIs.

## Closed-loop flow — mapped to real commands (no false autonomy)

The following is the **enforced** shape you can run in CI or locally. Steps marked **human/CI** cannot be done from this repo alone.

| Step | In-repo command / artifact |
|------|----------------------------|
| Request / intent | Issue, PR, operator note |
| Analyze | Cursor + rules; optional `npm run bossmind:audit` |
| Patch | Git diff (human or agent) |
| Build / lint | `npm run bossmind:deploy:gate` or `npm run bossmind:enterprise:release-verify` |
| Deploy | **Render / Railway** (human or pipeline with credentials) |
| Open live URL / HTTP checks | `BOSSMIND_REALITY_LIVE_URL=… npm run bossmind:enterprise:post-deploy` |
| Screenshot / pixel compare | **Playwright or external visual pipeline** (not shipped here) |
| Auto-fix / retry deploy | **Agent or CI job with policy**—not an infinite silent loop in `package.json` |
| Confirm + lock | `npm run bossmind:locked-production:verify`; after approved UI change: `npm run bossmind:baseline:seal` |
| Prevent false “completed” | `npm run bossmind:completion:gate` + live probe envs per `docs/BOSSMIND_TASK_COMPLETION_GATE.md` |

**Preflight scanner** (`bossmind:enterprise:preflight`) already covers hosting policy, forbidden public UI, protected surface, **duplicate Home / route authority**, and **immutable checksums**. It does not replace dependency audits beyond what `deploy:gate` runs—add Dependabot or `npm audit` in CI if you need more.

## What is **not** fully automatable inside Git alone

- **DeepSeek as supervisor** — requires your API keys, policies, and review; the repo exposes orchestration hooks, not a hosted brain.
- **Cursor as engine** — the IDE obeys rules you load; optimization is `.cursorignore` + concise rules + running gates—not hidden remote control of Cursor.
- **Auto-fix loop until prod matches** — needs write access, tests, and **explicit** approval for redeploy; otherwise you get unsafe silent changes.
- **Visual AI QA** — needs Playwright (or similar), golden images, artifact storage; optional hooks exist (`screenshot_analysis_log` schema) but not a full vision pipeline here.
- **“Task complete” from live UI** — declare completion only after **your** deploy + optional `BOSSMIND_REALITY_LIVE_URL` / completion gate live probe.

## Recommended workflows

**Before a risky or wide edit**

1. `npm run bossmind:checkpoint`
2. `npm run bossmind:enterprise:preflight`
3. Edit minimally (protected registry in `docs/PROTECTED_COMPONENTS_REGISTRY.md`)

**Before merge / deploy (full automation you can run in CI)**

1. `npm run bossmind:enterprise:release-verify` (preflight + `deploy:gate` including **build**)
2. Merge → Render/Railway deploy
3. `BOSSMIND_REALITY_LIVE_URL=https://resumora.net npm run bossmind:enterprise:post-deploy` (or `bossmind:reality:gate`)

**Before merge / deploy (manual two-step)**

1. `npm run bossmind:deploy:gate`
2. Merge → Render/Railway deploy
3. `BOSSMIND_REALITY_LIVE_URL=https://resumora.net npm run bossmind:reality:gate` (from CI or locally)

**After intentional public UI change**

1. Leadership approval  
2. `npm run bossmind:baseline:seal`  
3. `npm run bossmind:locked-production:verify`

## LangGraph + supervisor (code pointers)

- LangGraph-style repair: `lib/orchestration/langgraph-repair-flow.js`
- Supervisor worker: `scripts/bossmind-supervisor-worker.mjs`, `npm run bossmind:supervisor:once`
- Orchestration control surface: `pages/api/orchestration/bossmind-control.js` (protect in production)

## Sentry

Runtime errors flow through `@sentry/nextjs`; triage in Sentry remains operator-owned. Repo does not auto-close tasks from Sentry events alone.

## Versioning

When branding or shell assets change, follow `config/branding-asset-version.json` and `npm run bossmind:branding:icons` (see branding docs / closed-loop playbook).

## Autonomous optimization map (numbered enterprise checklist)

See **`docs/BOSSMIND_ENTERPRISE_AUTONOMOUS_OPTIMIZATION.md`** — maps closed-loop, Neon memory, preflight, visual QA gaps, immutable lock, supervisor hierarchy, recovery, reconciliation, repo segmentation, and production reality gate to **real npm scripts** vs **external** requirements. Strongest pre-merge chain: **`npm run bossmind:enterprise:autonomous-chain`**.

---

**Bottom line:** BossMind in this repo is a **strong governance + verification spine**. Full “autonomous enterprise” behavior is **Cursor + CI + hosting + Neon + your policies** working together—not a single hidden switch inside the application.
