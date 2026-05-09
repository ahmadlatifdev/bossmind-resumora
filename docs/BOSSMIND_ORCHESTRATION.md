# BossMind Shared-Memory Orchestration

This project now includes a persistent orchestration layer for shared memory, shared error intelligence, screenshot reference indexing, and guarded edit workflows.

## Centralized Memory (Neon)

Set `NEON_DATABASE_URL` to enable centralized state and error intelligence.

Tables created automatically:

- `task_state`
- `event_log`
- `error_memory`
- `missing_updates_log`
- `deployment_history`
- `rollback_snapshots`
- `screenshot_analysis_log`
- Resumora engagement: `engagement_profiles`, `engagement_sessions`, `engagement_visitors`, `engagement_likes`, `engagement_saves`, `engagement_requests`, `engagement_follows`, `engagement_reviews`, `engagement_activity`

## Activated Components

- **Shared memory + error intelligence** via `lib/shared/neon-memory.js`
- **Screenshot auto-indexing** via `lib/shared/screenshot-indexer.js`
- **LangGraph supervisor/worker repair flow** via `lib/orchestration/langgraph-repair-flow.js`
- **Local Ollama execution path** through `ollama.chat(...)`
- **File edit conflict protections** via `lib/shared/file-guard.js`

## Orchestration Flow

Sentry input -> shared error memory -> LangGraph supervisor/worker -> repair generation via Ollama -> validation signal -> deployment log -> saved fix pattern

## Screenshot Reference System

Default reference folder:

`D:\Shakhsy11\bossmind-resumora-base\reference-images`

Behavior:

- Recursively detects image files (`png/jpg/jpeg/webp`)
- Hashes each image (`sha256`) and stores references in `screenshot_analysis_log`
- Prevents duplicate processing by file hash and file path
- Serves indexed context via API for design/UI tasks

## API Endpoints

- `POST /api/orchestration/run-repair`
  - runs Sentry -> memory -> repair flow
- `GET /api/orchestration/screenshots`
  - returns indexed screenshot references
- `POST /api/orchestration/screenshots`
  - runs screenshot indexing now
- `POST /api/orchestration/file-guard`
  - actions: `lock`, `unlock`, `snapshot`

## Anti-Conflict Protections

- `lock`: prevents simultaneous edit workflows for same logical file key
- `snapshot`: writes rollback snapshot before modifications
- `unlock`: clears lock state after completion

## Validation Commands

- `npm run validate:deps`
- `npm run lint`
- `npm run build`
- `npm run validate:runtime`
- `npm run validate:all`

## Deployment stack note

Production targets **Railway + Neon + GitHub**. **Render is not used** in this architecture; keep workflows and docs aligned to `docs/ARCHITECTURE.md`.

## Anti-leak checklist (multi-agent)

1. Branch per initiative; avoid two agents on one branch.
2. Call **file-guard** `snapshot` before large edits; `unlock` after validation.
3. Run `npm run build` before merge to catch route/API collisions.
4. Keep `NEON_DATABASE_URL` set so shared memory and engagement dedupe stay authoritative.

## IDE automation performance

- Scope indexing to the repo root; exclude `.next`, `node_modules`, large binaries.
- Prefer orchestration APIs over ad-hoc duplicate UI dumps.
- Run `validate:all` before long-running agent batches to stabilise checkpoints.

See also `docs/ARCHITECTURE.md` for engagement tables and approved toolchain.


