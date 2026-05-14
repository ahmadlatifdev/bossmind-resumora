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

## Enterprise AI engineering (Cursor + BossMind)

- **Cursor index:** `.cursorignore` (fewer irrelevant files indexed).  
- **Preflight before wide edits:** **`npm run bossmind:enterprise:preflight`** (hosting, forbidden UI, protected surface, structural authority, immutable checksums; optional `BOSSMIND_ENTERPRISE_PREFLIGHT_BUILD=1`).  
- **Pre-merge release chain (preflight + full deploy gate):** **`npm run bossmind:enterprise:release-verify`**.  
- **Maximum in-repo verify (release chain + structural production lock):** **`npm run bossmind:enterprise:autonomous-chain`** — see **`docs/BOSSMIND_ENTERPRISE_AUTONOMOUS_OPTIMIZATION.md`**.  
- **After deploy (build + lock + optional live URL):** **`npm run bossmind:enterprise:post-deploy`** with **`BOSSMIND_REALITY_LIVE_URL`** set when you need production HTML/health checks.  
- **What is / is not automatable in-repo:** **`docs/BOSSMIND_ENTERPRISE_AI_ENGINEERING_STACK.md`**.

- **Sibling product branding (BossMind Capital):** **`docs/BOSSMIND_CAPITAL_BRAND.md`** — the Capital **app** is a separate repo; Resumora only registers it in `config/bossmind-organic-growth-registry.json`.
- **BossMind Capital core stack (integrations contract):** **`docs/BOSSMIND_CAPITAL_CORE_STACK.md`** — architecture for TradingView, OpenAI, DeepSeek, Polygon, Sentry, n8n, GitHub, Neon; **not activated inside Resumora**.
- **Resumora AI support mail (Gmail + n8n + Neon policy):** **`docs/RESUMORA_AI_SUPPORT_MAIL_AUTOMATION.md`** + **`config/resumora-ai-support-mail-architecture.json`** + **`npm run resumora:support:ai:arch-lock`** (Neon audit after external go-live).
- **Railway closed-loop repair:** **`docs/BOSSMIND_RAILWAY_CLOSED_LOOP_REPAIR.md`** — `POST /api/orchestration/railway-incident-webhook` + `bossmind:supervisor` + `deployment_repair_log`.

## Task completion vs production “live”

- Repo-enforced “ready to ship” pipeline: **`npm run bossmind:completion:gate`** (build + guards + immutable verify; optional live HTML probe). See **`docs/BOSSMIND_TASK_COMPLETION_GATE.md`**.
- Pre-merge / pre-deploy aggregate: **`npm run bossmind:deploy:gate`** (includes forbidden public UI scan + deploy checkpoint + immutable + build).
- Declaring work finished for **resumora.net** still requires a successful **Render deploy** (or equivalent); use **`BOSSMIND_COMPLETION_LIVE_PROBE=1`** with **`BOSSMIND_COMPLETION_PROBE_ORIGIN=https://resumora.net`** after deploy to verify production HTML markers.
- **Immutable design lock:** sealed checksums + `luxury-v1` snapshots + `npm run bossmind:locked-production:verify` — see **`docs/BOSSMIND_IMMUTABLE_PRODUCTION_LOCK.md`**.
