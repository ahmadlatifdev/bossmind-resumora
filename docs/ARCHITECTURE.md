# BossMind + Resumora architecture (2026)

## Approved runtime stack

Deploy and automation are aligned to this toolchain only:

- **Railway** — application hosting and continuous deployment from Git.
- **Neon** — Postgres for shared orchestration memory and Resumora engagement data (`NEON_DATABASE_URL`).
- **GitHub** — source of truth, PR workflow, CI hooks.
- **PowerShell** — local scripting and validation on Windows runners.
- **Cursor / Windsurf** — agent editing with orchestration APIs (`/api/orchestration/*`).
- **Ollama** — local LLM execution for repair flows (`OLLAMA_MODEL` optional).
- **LangGraph** — supervisor/worker orchestration (`lib/orchestration/langgraph-repair-flow.js`).

Render is **not** part of this architecture; no deployment flows should reference it.

## Anti-leak / conflict controls (operational)

These mechanisms reduce overwrite collisions and mixed UI states across concurrent editors:

| Mechanism | Role |
|-----------|------|
| **File guard API** (`POST /api/orchestration/file-guard`) | `lock` / `unlock` / `snapshot` around risky edits |
| **Rollback snapshots** (`rollback_snapshots` table) | Stored body + hash before edits |
| **Shared memory** (`task_state`, `event_log`, `error_memory`) | Single writer semantics per `(project_key, task_key)` tasks |
| **Screenshot indexer** | Dedupes by path + hash to avoid redundant UI context |

IDE-level enforcement (Cursor/Windsurf) still requires discipline: one agent per branch, pull before push, and avoid parallel edits on the same route files.

## Persistence & continuity

With `NEON_DATABASE_URL` set:

- Shared memory tables initialise on boot (`initializeSharedMemory`).
- Engagement events append to `engagement_activity` and mirror into `event_log` via `saveEvent` where possible.
- Error fingerprints dedupe in `error_memory`.

Local editors should enable **Files: Auto Save** in the IDE for frictionless checkpoints; database-backed checkpoints remain the source of truth for multi-machine workflows.

## Resumora engagement (Neon-backed)

Tables created alongside orchestration memory:

- `engagement_profiles`, `engagement_sessions`, `engagement_visitors`
- `engagement_likes`, `engagement_saves`, `engagement_requests`, `engagement_follows`
- `engagement_reviews`, `engagement_activity`

APIs under `/api/engagement/*` power likes, saves, follow, registration, login, and aggregate analytics.

Duplicate likes/follows per actor are prevented with partial unique indexes on `(resource_key, profile_id)` / `(resource_key, visitor_id)`.
