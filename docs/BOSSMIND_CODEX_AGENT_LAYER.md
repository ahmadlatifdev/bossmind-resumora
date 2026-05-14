# BossMind — OpenAI Codex agent layer (coding + repair only)

This document defines how **OpenAI Codex** fits the BossMind ecosystem **without** making it the primary reasoning brain, orchestration master, or email engine.

## Role split (locked)

| Agent / system | Responsibility |
|----------------|----------------|
| **DeepSeek (R1/V3)** | Master reasoning, triage, root-cause hypotheses, orchestration intelligence **outside** unsupervised production writes. |
| **ChatGPT** | Strategic planning, stakeholder comms drafts, narrative — **not** sole authority on money/legal/deploy. |
| **Codex** | **Repository analysis, patch generation, build/CI repair, PowerShell/script refinement, dependency repair** under **whitelist + validation**. |
| **Gemini** | Workspace productivity (separate product policy). |
| **n8n** | Workflow orchestration, schedules, human-in-the-loop. |
| **Neon** | `task_state`, `event_log`, `error_memory`, fix patterns. |
| **BossMind (this repo + gates)** | Antileak, snapshots, deploy gate, protected surface, **validation layer before merge/deploy**. |

## In-repo artifacts

- **`config/bossmind-codex-agent-layer.json`** — boundaries, repair pipeline order, GitHub App hints, Master Admin widget data contract.
- **`config/bossmind-orchestration-policy.json`** — orchestration flow includes **`codex_patch_candidate`** and **`bossmind_validation_layer`**.
- **`lib/orchestration/bossmind-codex-status.js`** — status object for health API.
- **`pages/api/orchestration/bossmind-health.js`** — exposes **`codexAgentLayer`** for **Master Admin** (separate repo) to render a widget.

## Repair flow (target)

1. **Sentry** error → ingest API.  
2. **DeepSeek** analysis (Railway worker — keys not in git).  
3. **LangGraph** task (`lib/orchestration/langgraph-repair-flow.js`).  
4. **Codex** patch candidate (GitHub-connected agent; least privilege).  
5. **BossMind validation** (`lint`, `build`, `bossmind:deploy:gate`, `bossmind:protect:verify` as applicable).  
6. **Deploy** (Render/Railway — external).  
7. **Verify** (reality gate / health).  
8. **Persist** fix pattern to **Neon** `error_memory` / `event_log`.

## Anti-leak / anti-regression

- Never overwrite **immutable** or **latest locked stable** state without explicit approval (`docs/BOSSMIND_IMMUTABLE_PRODUCTION_LOCK.md`).  
- **Snapshot** before writes (`npm run bossmind:snapshot`, file-guard).  
- **Rollback** on failed validation (`rollback_snapshots`, git revert).

## Master Admin widget

The **UI** is **not** implemented in Resumora (Master Admin is another codebase). Poll:

`GET /api/orchestration/bossmind-health`

with `Authorization: Bearer BOSSMIND_ORCHESTRATION_SECRET` (or dev / `BOSSMIND_DIAGNOSTICS=1`) and read **`codexAgentLayer`**.

## Enable flags (operator)

- `BOSSMIND_CODEX_LAYER_ENABLED=1` — marks layer as intentionally active in health output (does not invoke Codex by itself).  
- Optional GitHub App hints: `BOSSMIND_GITHUB_APP_ID`, `BOSSMIND_GITHUB_APP_INSTALLATION_ID` (non-secret identifiers only; **private keys stay in Secret Manager**).

## References

- `lib/orchestration/langgraph-repair-flow.js`  
- `docs/BOSSMIND_ORCHESTRATION.md`  
- `docs/PROTECTED_COMPONENTS_REGISTRY.md` (Master Admin external)
