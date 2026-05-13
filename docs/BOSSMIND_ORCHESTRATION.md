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

## Sentry (runtime + hydration)

- Install: `@sentry/nextjs` with `instrumentation.ts`, `sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`, and `next.config.ts` wrapped via `withSentryConfig`.
- Set **`NEXT_PUBLIC_SENTRY_DSN`** (and optionally **`SENTRY_DSN`** for server-only) before enabling reporting. Without DSN, Sentry does not initialize (safe for local dev).
- Client captures hydration/React errors when DSN is present. Tune **`NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE`** / **`SENTRY_TRACES_SAMPLE_RATE`** (default `0.1`).

## Stripe → Neon financial audit

- **`POST /api/webhooks/stripe`** — Stripe-signed webhooks; requires **`STRIPE_WEBHOOK_SECRET`** + **`STRIPE_SECRET_KEY`**. Writes `stripe_webhook.*` rows into `event_log` for centralized BossMind tracking (refunds, checkout completion, etc.).
- Checkout sessions already attach plan + **UTM metadata** (`pages/api/checkout.js`); **`verify-session`** logs paid sessions once (`stripe_checkout_paid`).
- Other BossMind apps (ElegancyArt, AI Video Generator, TikTok AI, BossMind Capital): reuse the same Stripe + webhook pattern with **`BOSSMIND_PROJECT_KEY`** set per deployment.

## Orchestration ingress (multi-project)

| Env | Purpose |
|-----|---------|
| `BOSSMIND_PROJECT_KEY` | Neon partition (`resumora`, `elegancyart`, …). |
| `BOSSMIND_ORCHESTRATION_SECRET` | Bearer for `/api/orchestration/sentry-ingest`, `/api/orchestration/deployment-report`. |
| `NEON_DATABASE_URL` | Required for repair flow + logs. |

| Route | Role |
|-------|------|
| `POST /api/orchestration/run-repair` | LangGraph repair (manual or CI). |
| `POST /api/orchestration/sentry-ingest` | Same repair pipeline; bearer auth; body `{ sentryEvent, validationResult?, deployResult? }`. When **`BOSSMIND_SENTRY_ENQUEUE_ONLY=1`**, inserts a **`pending`** row in `task_state` and returns **202** (`run_repair` job) instead of executing inline — **`npm run bossmind:supervisor`** consumes the queue. |
| `POST /api/orchestration/deployment-report` | Record deploy verification → `deployment_history`. |
| `POST /api/webhooks/stripe` | Stripe → `event_log`. |

### Persistent supervisor worker (queue runner)

Runs outside the Next.js request cycle: **`npm run bossmind:supervisor`**.

Requirements: **`NEON_DATABASE_URL`**, **`DEEPSEEK_API_KEY`** or Ollama (for `run_repair` jobs), orchestration-safe env as needed.

Behavior:

1. Loads `.env.local` / `.env` then **`claimNextPendingTask`** on `task_state` (`pending`/`queued`) with Postgres **`SKIP LOCKED`** for safe multi-consumer starts.
2. **`job`:** **`run_repair`** → **`runRepairFlow`** (existing LangGraph / fallback path).
3. **`job`:** **`health_probe`** → `GET {origin}/api/health`; marks **`completed`** / **`failed`**.
4. **`job`:** **`noop`** → audit event only.

**Cron / one-shot:** `npm run bossmind:supervisor:once` (runs one drain burst).

**Enqueue from control plane:** `POST /api/orchestration/bossmind-control` **`action":"enqueue"`** with `payload: { job: "health_probe", origin: "https://your-app.up.railway.app" }` (needs bearer secret).

**Railway:** add a second service (same repo) with **`Start Command`**: `npm run bossmind:supervisor` — no HTTP port required. Keep **`NEON_DATABASE_URL`** aligned with production.

Pair with **`npm run bossmind:watch:dev`** on a dev VM for localhost auto-recovery; the supervisor fills the “reasoning/action queue,” not webpack restarts.

## Validation pipeline (local / CI)

- **`npm run bossmind:validate`** — runs `validate:all` (deps, lint, build, runtime). Pair with git push + **`deployment-report`** after Railway/production verification.

**Note:** IDE automation (Cursor/Copilot/Windsurf applying patches) remains external; this repo exposes APIs and Neon persistence so workers can follow a consistent sequence.

## Social growth automation layer

- Unified cross-platform growth engine: **`lib/marketing/social-growth-engine.js`** (weekly cadence, dedupe on publish)
- CLI runner + publish dispatch: **`npm run marketing:growth-engine`**, **`npm run marketing:growth-engine:publish`**, **`npm run marketing:growth-engine:dry-run`** (`--no-dedupe` to force replays)
- Google organic artifact engine: **`lib/marketing/google-organic-engine.js`**, **`npm run marketing:google-organic`**, **`npm run marketing:google-organic:dry`**
- Performance rollup: **`npm run marketing:growth-report`**
- Secure orchestration endpoint: **`POST /api/integrations/social-growth-orchestrate`** (Bearer `BOSSMIND_ORCHESTRATION_SECRET` or `SOCIAL_AUTOMATION_SECRET`; body may include `skipIfAlreadyPublished: false`)
- Metrics ingest endpoint: **`POST /api/integrations/social-ingest`** (Bearer `SOCIAL_INGEST_SECRET`)
- Full setup and env map: **`docs/SOCIAL_GROWTH_AUTOMATION.md`**

## Safe review workflow & checkpoints

- **Policy:** Agents default to **review / fix-only** changes; see **`docs/BOSSMIND_SAFE_REVIEW_WORKFLOW.md`** and **`.cursor/rules/bossmind-resumora.mdc`**.
- **Protected paths:** **`docs/PROTECTED_COMPONENTS_REGISTRY.md`**
- **Git checkpoint before risky edits:** `npm run bossmind:checkpoint` (logs + instructions; **`--stash`** creates a stash). Logs **`bossmind.git.checkpoint`** to **`event_log`** when Neon is configured.
- **Enterprise readiness (code-level audit):** **`docs/MONETIZATION_ENTERPRISE_READINESS_REPORT.md`** — external dashboards are still **manual**.

