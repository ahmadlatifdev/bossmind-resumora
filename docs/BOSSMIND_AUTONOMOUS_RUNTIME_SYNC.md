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
```

`validate:hosting` is a hard policy gate: it blocks Vercel env/config/guidance unless `BOSSMIND_ALLOW_VERCEL=1` is explicitly set.

## Status API

- `GET /api/orchestration/runtime-sync-status`
- Returns local status + Neon authority/events/tasks
- Auth: development, `BOSSMIND_DIAGNOSTICS=1`, or Bearer `BOSSMIND_ORCHESTRATION_SECRET`

## Safety

- No destructive git commands
- No `.git` mutation
- No source-file deletion
- Cache cleanup only removes `.next`
