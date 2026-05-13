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

**Before merge / deploy**

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

---

**Bottom line:** BossMind in this repo is a **strong governance + verification spine**. Full “autonomous enterprise” behavior is **Cursor + CI + hosting + Neon + your policies** working together—not a single hidden switch inside the application.
