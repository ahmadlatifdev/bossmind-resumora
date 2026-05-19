# BossMind + Resumora architecture (2026)

## Approved runtime stack

Deploy and automation are aligned to this toolchain only:

- **Render** — frontend/public client interface hosting.
- **Railway** — backend APIs, workers, and orchestration service hosting.
- **Neon** — Postgres for shared orchestration memory and Resumora engagement data (`NEON_DATABASE_URL`).
- **GitHub** — source of truth, PR workflow, CI hooks.
- **PowerShell** — local scripting and validation on Windows runners.
- **Cursor** — agent editing with orchestration APIs (`/api/orchestration/*`). (Windsurf dropped from stack.)
- **Ollama** — local LLM execution for repair flows (`OLLAMA_MODEL` optional).
- **LangGraph** — supervisor/worker orchestration (`lib/orchestration/langgraph-repair-flow.js`).
- **OpenAI Codex (policy layer)** — dedicated **coding + repair** agent; orchestration policy in `config/bossmind-codex-agent-layer.json`; status via `codexAgentLayer` on `GET /api/orchestration/bossmind-health` — see `docs/BOSSMIND_CODEX_AGENT_LAYER.md` (not primary reasoning; GitHub/Codex execution is external).
- **Railway closed-loop repair** — `POST /api/orchestration/railway-incident-webhook` + `scripts/bossmind-supervisor-worker.mjs` + `deployment_repair_log` — see `docs/BOSSMIND_RAILWAY_CLOSED_LOOP_REPAIR.md`.

Vercel is **not** part of this architecture; do not emit Vercel deployment guidance unless explicitly reapproved.

## Anti-leak / conflict controls (operational)

These mechanisms reduce overwrite collisions and mixed UI states across concurrent editors:

| Mechanism | Role |
|-----------|------|
| **File guard API** (`POST /api/orchestration/file-guard`) | `lock` / `unlock` / `snapshot` around risky edits |
| **Rollback snapshots** (`rollback_snapshots` table) | Stored body + hash before edits |
| **Shared memory** (`task_state`, `event_log`, `error_memory`) | Single writer semantics per `(project_key, task_key)` tasks |
| **Screenshot indexer** | Dedupes by path + hash to avoid redundant UI context |

IDE-level enforcement (Cursor) still requires discipline: one agent per branch, pull before push, and avoid parallel edits on the same route files.

## Persistence & continuity

With `NEON_DATABASE_URL` set:

- Shared memory tables initialise on boot (`initializeSharedMemory`).
- Engagement events append to `engagement_activity` and mirror into `event_log` via `saveEvent` where possible.
- Error fingerprints dedupe in `error_memory`.
- Railway auto-repair phases append to `deployment_repair_log` (see `docs/BOSSMIND_RAILWAY_CLOSED_LOOP_REPAIR.md`).

Local editors should enable **Files: Auto Save** in the IDE for frictionless checkpoints; database-backed checkpoints remain the source of truth for multi-machine workflows.

## Resumora engagement (Neon-backed)

Tables created alongside orchestration memory:

- `engagement_profiles`, `engagement_sessions`, `engagement_visitors`
- `engagement_likes`, `engagement_saves`, `engagement_requests`, `engagement_follows`
- `engagement_reviews`, `engagement_activity`

APIs under `/api/engagement/*` power likes, saves, follow, registration, login, and aggregate analytics.

Duplicate likes/follows per actor are prevented with partial unique indexes on `(resource_key, profile_id)` / `(resource_key, visitor_id)`.
