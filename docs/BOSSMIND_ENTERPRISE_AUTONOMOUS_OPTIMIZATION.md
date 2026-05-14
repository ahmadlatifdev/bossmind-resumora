# BossMind enterprise autonomous optimization — enforcement map

This document **aligns** the requested “fully autonomous” ecosystem with **what this repository actually runs**, and labels **gaps** that require CI credentials, Playwright/visual baselines, hosting APIs, or human policy (no false claims of infinite auto-fix or unsupervised redeploy).

**Canonical stack narrative:** `docs/BOSSMIND_ENTERPRISE_AI_ENGINEERING_STACK.md`  
**Single maximum in-repo verify chain:** `npm run bossmind:enterprise:autonomous-chain`

---

## 1) Closed-loop runtime enforcement

| Requested step | In-repo / CI | Honest boundary |
|----------------|--------------|-------------------|
| Request → Analyze → Patch | Human / Cursor + rules | No autonomous “patch” without an agent with repo write access |
| Build | `npm run bossmind:deploy:gate`, `bossmind:reality:gate` (build first) | ✔ |
| Deploy | Render / Railway / GitHub Actions | **Hosting credentials** — not invoked from `package.json` |
| Open live URL | `BOSSMIND_REALITY_LIVE_URL` + `npm run bossmind:enterprise:post-deploy` | ✔ when URL set |
| Screenshot → compare → auto-fix loop | **Not shipped** | Needs Playwright + golden images + artifact store + **approved** auto-merge policy |
| Confirm → Lock | `npm run bossmind:locked-production:verify`; seal: `npm run bossmind:baseline:seal` | ✔ checksum lock; **seal is human-approved** |

**False “completed” prevention:** `npm run bossmind:completion:gate` + optional live probe envs (`docs/BOSSMIND_TASK_COMPLETION_GATE.md`).

---

## 2) Unified BossMind memory core (Neon)

Implemented in **`lib/shared/neon-memory.js`** when `NEON_DATABASE_URL` is set:

| Table / artifact | Purpose |
|------------------|---------|
| `task_state` | Supervisor queue, pipeline state |
| `event_log` | Append-only audit |
| `error_memory` | Deduplicated fingerprints |
| `missing_updates_log` | Control-plane gaps |
| `deployment_history` | Deploy records |
| `runtime_authority` | Sealed UI authority rows |
| `rollback_snapshots` | Recovery snapshots |
| `last_confirmed_checkpoint` | Continuity (`bossmind-continuity-status.mjs`) |

**Protected UI baselines / route registry:** JSON + scripts (`config/bossmind-immutable-production-baseline.json`, `bossmind-protected-ui-authority.json`, `bossmind-interface-authority.js`) — not all stored as SQL rows; **Neon + repo files** together form authority.

**Cross-project:** each product should use its own `BOSSMIND_PROJECT_KEY` and migrations; this repo is **Resumora-first**.

---

## 3) Autonomous preflight scanner

| Scan | Command / module |
|------|------------------|
| Hosting, forbidden UI, protected surface, structural authority, immutable checksums | `npm run bossmind:enterprise:preflight` |
| Deploy checkpoint, antileak, lint, build, optional immutable prod probe | `npm run bossmind:deploy:gate` |
| Duplicate Home / index wiring | `bossmind:locked-production:verify` (structural block) |
| Orphan components / every import | **Partial** — add ESLint rules + `knip` in CI if you need stricter orphan detection |
| ESLint vs BossMind checkpoints | **`eslint.config.mjs`** ignores **`.bossmind/**`** so pre-deploy copies are not linted as source |
| Dependency conflicts | `npm run validate:deps` — not in default deploy gate |

**Unsafe → auto-fix:** in-repo scripts **block** or **suggest** (`bossmind:recovery:suggest`); they do **not** silently rewrite production without policy.

---

## 4) Visual AI verification

| Capability | Status |
|------------|--------|
| Live HTML footer / marker drift | `BOSSMIND_REALITY_LIVE_URL` + `bossmind:enterprise:post-deploy` uses `bossmind-footer-live-drift.js` |
| Pixel / screenshot AI compare | **Not in-repo** — add Playwright + golden screenshots in CI |
| Mobile vs desktop | **Not automated here** — Playwright projects or manual |

Tasks **must not** be called “visually verified in CI” until **your** visual pipeline exists.

---

## 5) Immutable production lock

| Capability | Command / config |
|------------|------------------|
| Checksums + luxury snapshot | `config/bossmind-immutable-production-baseline.json` |
| Verify | `npm run bossmind:locked-production:verify` |
| Seal after approved change | `npm run bossmind:baseline:seal` |
| Restore | `npm run bossmind:baseline:restore` |

Screenshot baselines as lock artifacts: **external** (S3, Git LFS, CI artifacts).

---

## 6) AI supervisor hierarchy

**Desired** order is documented in `BOSSMIND_ENTERPRISE_AI_ENGINEERING_STACK.md`. **In-repo:** LangGraph repair (`lib/orchestration/langgraph-repair-flow.js`), supervisor worker (`npm run bossmind:supervisor:once`), orchestration APIs. **DeepSeek / Cursor** are **external** — keys and behavior are operator-owned.

---

## 7) Autonomous recovery + auto-fix

| Trigger | In-repo |
|---------|---------|
| Build / lint failure | Gates **exit non-zero** — no infinite retry in npm |
| Runtime repair / sync | `npm run bossmind:runtime:repair`, `bossmind:runtime:sync:once`, `bossmind:reconcile` |
| Self-heal / snapshot | `npm run bossmind:self-heal`, `bossmind:snapshot` |

**Auto-fix until prod matches:** requires a **policy-bound CI agent** (separate from this repo’s scripts).

---

## 8) Runtime reconciliation

`npm run bossmind:reconcile` + runtime sync scripts compare local/Git-style signals to expectations; **production runtime** truth still needs **live URL** or hosting API.

---

## 9) Repository segmentation

Maintain **separate repos** per product (`BOSSMIND_REPO_ROOT_*` in organic growth registry). Avoid monolithic mixed-context trees; use **`.cursorignore`** and **per-project** Neon keys.

---

## 10) Production reality gate

A change is **production-credible** when:

1. `npm run bossmind:enterprise:autonomous-chain` passed **before** merge (local/CI).  
2. Deploy succeeded on **Render/Railway** (operator/CI).  
3. `BOSSMIND_REALITY_LIVE_URL=https://resumora.net npm run bossmind:enterprise:post-deploy` passed **after** deploy.  
4. Optional: `BOSSMIND_COMPLETION_LIVE_PROBE=1` per completion gate docs.  
5. Optional: `npm run bossmind:closed-loop:record` with task id for Neon audit.

**“All ten bullets approved”** in the user checklist = **policy adopted**; **technical completion** = running the commands above + adding **Playwright** for true visual enforcement.

---

## Recommended commands (copy-paste)

**Before merge (maximum in-repo enforcement):**

```bash
npm run bossmind:enterprise:autonomous-chain
```

**After deploy (production truth + optional closed-loop record):**

```bash
set BOSSMIND_REALITY_LIVE_URL=https://resumora.net
npm run bossmind:enterprise:post-deploy
```

**Strict “done” (includes stricter completion definition):**

```bash
npm run bossmind:completion:gate
```

---

## References

- `docs/BOSSMIND_ENTERPRISE_AI_ENGINEERING_STACK.md`  
- `docs/BOSSMIND_ORCHESTRATION.md`  
- `docs/BOSSMIND_IMMUTABLE_PRODUCTION_LOCK.md`  
- `docs/BOSSMIND_TASK_COMPLETION_GATE.md`  
- `docs/BOSSMIND_CLOSED_LOOP_PLAYBOOK.md`
