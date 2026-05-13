<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Deployment

BossMind locked hosting strategy:

- **Render** = frontend/public client interfaces
- **Railway** = backend APIs, workers, orchestration services
- **Neon** = shared memory + Postgres authority (`task_state`, `event_log`, `error_memory`, snapshots)
- **GitHub** = source control + deploy triggers
- **PowerShell** = local execution/repair tooling

Do **not** recommend, add, or preserve any **Vercel** deployment path unless the user explicitly reapproves it in-thread. See `docs/RAILWAY_DEPLOY.md`.

## Local preview (development)

`npm run dev` runs `scripts/dev-with-browser.mjs` (spawns `next dev` and opens the browser when ready; polls `/api/health` as a fallback). Use `npm run dev:plain` for `next dev` only. Do not ship client-visible debug preview chrome in production builds.

## BossMind safe review mode

- Follow **`.cursor/rules/bossmind-resumora.mdc`** and **`docs/BOSSMIND_SAFE_REVIEW_WORKFLOW.md`** (fix-only unless the user explicitly approves redesign).
- Before wide edits: **`npm run bossmind:checkpoint`** (use **`npm run bossmind:checkpoint -- --stash`** only when intentionally stashing WIP)
- Protected surfaces: **`docs/PROTECTED_COMPONENTS_REGISTRY.md`**

## Task completion vs production “live”

- Repo-enforced “ready to ship” pipeline: **`npm run bossmind:completion:gate`** (build + guards + immutable verify; optional live HTML probe). See **`docs/BOSSMIND_TASK_COMPLETION_GATE.md`**.
- Pre-merge / pre-deploy aggregate: **`npm run bossmind:deploy:gate`** (includes forbidden public UI scan + deploy checkpoint + immutable + build).
- Declaring work finished for **resumora.net** still requires a successful **Render deploy** (or equivalent); use **`BOSSMIND_COMPLETION_LIVE_PROBE=1`** with **`BOSSMIND_COMPLETION_PROBE_ORIGIN=https://resumora.net`** after deploy to verify production HTML markers.
- **Immutable design lock:** sealed checksums + `luxury-v1` snapshots + `npm run bossmind:locked-production:verify` — see **`docs/BOSSMIND_IMMUTABLE_PRODUCTION_LOCK.md`**.
