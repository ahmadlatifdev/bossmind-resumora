# BossMind — Railway closed-loop auto-repair

This turns **“crash email only”** into an **actionable repair pipeline** when you wire **Railway → webhook → this repo → supervisor worker → Neon**.

## Live chain (implemented in-repo)

1. **Railway crash** (or n8n relay) → `POST /api/orchestration/railway-incident-webhook` (Bearer `BOSSMIND_RAILWAY_WEBHOOK_SECRET` or `BOSSMIND_ORCHESTRATION_SECRET`).  
2. Webhook **queues** `task_state` with `job: "railway_closed_loop"` (fast `202`).  
3. **`npm run bossmind:supervisor`** on **Railway** (or cron `--once`) **claims** the task and runs `lib/orchestration/railway-closed-loop-worker.js`:  
   - `deployment_repair_log` phases: `crash_received` → `logs_fetched` → `classified` → `patch_generated` (stub) → `validated` → `github_push` (skipped by default) → `redeploy_triggered` → `health_verified`  
   - **DeepSeek** (via `callRepairPlannerModel` / `DEEPSEEK_API_KEY`) for root-cause text  
   - **Optional** Railway GraphQL (`RAILWAY_TOKEN` + `BOSSMIND_RAILWAY_PROJECT_ID`)  
   - **Optional** antileak + `npm run build` when `BOSSMIND_RAILWAY_RUN_BUILD_GUARD=1`  
   - **Optional** `serviceInstanceRedeploy` when `BOSSMIND_RAILWAY_AUTO_REDEPLOY=1`  
   - **Optional** `/api/health` probe when `BOSSMIND_RAILWAY_HEALTH_ORIGIN` is set  
4. Writes **`event_log`**, **`error_memory`**, **`deployment_history`**, **`deployment_repair_log`**, **`task_state`**.

## What is still intentionally NOT automatic

- **Git commit/push from production** — default **off** (`BOSSMIND_RAILWAY_AUTO_PUSH` not honored for real push; use **GitHub Actions** + branch protection + PR review).  
- **Codex-generated patches applied blindly** — worker logs **stub** until an external Codex runner opens a PR.

## Loop protection

- `BOSSMIND_RAILWAY_REPAIR_EMERGENCY_STOP=1` — abort immediately.  
- `BOSSMIND_RAILWAY_REPAIR_MAX_PER_FINGERPRINT` (default `6`) — stops repeat storms per fingerprint in 24h.

## Master Admin widget

`GET /api/orchestration/bossmind-health` → **`railwayClosedLoop`** (`widgetSteps`, `pendingRailwayTasks`, `emergencyStop`, …).

## n8n wiring (example)

HTTP Request node → `https://<your-render-origin>/api/orchestration/railway-incident-webhook`  
Headers: `Authorization: Bearer <BOSSMIND_RAILWAY_WEBHOOK_SECRET>`  
Body: JSON from Railway email parser or Railway API poll.

## Env reference

| Variable | Role |
|----------|------|
| `NEON_DATABASE_URL` | Required for queue + logs |
| `BOSSMIND_RAILWAY_WEBHOOK_SECRET` | Webhook auth (recommended dedicated secret) |
| `RAILWAY_TOKEN` | GraphQL API |
| `BOSSMIND_RAILWAY_PROJECT_ID` | Railway project id |
| `BOSSMIND_RAILWAY_ENVIRONMENT_ID` / `BOSSMIND_RAILWAY_SERVICE_ID` | For redeploy mutation |
| `BOSSMIND_RAILWAY_AUTO_REDEPLOY` | `1` to call redeploy after validation |
| `BOSSMIND_RAILWAY_RUN_BUILD_GUARD` | `1` to run antileak + build on worker checkout |
| `BOSSMIND_RAILWAY_HEALTH_ORIGIN` | e.g. `https://resumora.net` for post-repair probe |

## References

- `lib/orchestration/railway-closed-loop-worker.js`  
- `pages/api/orchestration/railway-incident-webhook.js`  
- `scripts/bossmind-supervisor-worker.mjs`
