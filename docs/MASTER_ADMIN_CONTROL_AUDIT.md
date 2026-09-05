# Master Admin Control Audit

**Scope:** `https://resumora.net/admin/master` (and linked admin routes)  
**Code baseline:** branch with financials + English lock  
**Date:** 2026-09-05

## Status legend

| Status          | Meaning                                                       |
| --------------- | ------------------------------------------------------------- |
| Working         | Wired to API/UI; returns actionable feedback                  |
| Partial         | Works with limits (catalog-only, display-only, env-dependent) |
| Not implemented | No control / no backend — do not expect it                    |
| Fixed (local)   | Corrected in this audit pass; needs GH Actions deploy         |

---

## Control matrix

| Panel         | Control                                               | Status          | Notes                                                                               |
| ------------- | ----------------------------------------------------- | --------------- | ----------------------------------------------------------------------------------- |
| Overview      | Refresh                                               | Fixed (local)   | Reloads dashboard + projects + Hermes + tasks + financials; spinner + success/error |
| Overview      | Run system heal                                       | Fixed (local)   | Confirm dialog before POST `/api/admin/system-health/run`                           |
| Overview      | System Health link                                    | Working         | Routes to `/admin/system-health`                                                    |
| Overview      | Refunds link                                          | Working         | Routes to `/admin/refunds`                                                          |
| Overview      | Project metric cards                                  | Partial         | Resumora live metrics; other projects catalog/sparse                                |
| Overview      | Revenue chart / feed                                  | Working         | From master-dashboard payload                                                       |
| Orchestration | Project cards (select)                                | Working         | Sets project + hash                                                                 |
| Orchestration | Online/offline + health colour                        | Working         | Derived from `live` / score / status                                                |
| Orchestration | Open Hermes Chat                                      | Fixed (local)   | Scrolls to `#hermes-chat` with project context                                      |
| Orchestration | Visit live URL                                        | Fixed (local)   | Uses `envRegistry.PUBLIC_URL` when set (Resumora → resumora.net)                    |
| Orchestration | Pause / Resume                                        | Not implemented | **By design** — no production pause API; catalog `status` only                      |
| Orchestration | Inline Hermes chat                                    | Fixed (local)   | Removed duplicate; single chat at Hermes Chat panel                                 |
| AI Agents     | Status / latency / metrics                            | Working         | From `/api/admin/hermes-status`                                                     |
| AI Agents     | Hermes chat toggle                                    | Working         | POST `/api/admin/hermes-chat`                                                       |
| AI Agents     | Load insights                                         | Working         | GET `/api/admin/hermes-insights`; needs Hermes URL for rich text                    |
| Hermes Chat   | Project dropdown                                      | Fixed (local)   | Persists in `sessionStorage`; updates header/context                                |
| Hermes Chat   | Send                                                  | Working         | POST `/api/admin/hermes-command`; engine label shows hermes vs gemini               |
| Hermes Chat   | Typing indicator                                      | Fixed (local)   | Visible while request in flight                                                     |
| Hermes Chat   | Clear chat                                            | Fixed (local)   | Clears messages for active project only                                             |
| Hermes Chat   | Tunnel-down errors                                    | Fixed (local)   | Friendlier message when Hermes unreachable                                          |
| Tasks         | Refresh / Create sample / ACK / Reject / Mark applied | Working         | Firestore harness_tasks                                                             |
| Tasks         | Auto-deploy toggle                                    | Working         | Saves `autoDeployAfterAck`; deploy still needs workflow + secrets                   |
| Financials    | Refresh / Allocate / charts                           | Partial         | Code ready; **needs Functions deploy** of `getAdminFinancials`                      |
| Users         | Count display                                         | Partial         | Resumora activeUsers only; **no user management UI**                                |
| Settings      | Healing / KYC                                         | Partial         | Link-out to System Health (source of truth)                                         |
| Nav           | NOIR LUXE                                             | Working         | Opens `/admin-dashboard.html` (standalone mock cockpit — not theme switcher)        |
| Nav           | Hash section links                                    | Fixed (local)   | Smooth scroll into view after load                                                  |

---

## Optimisations applied

1. Delayed busy spinner on full dashboard refresh (`aria-busy`).
2. Explicit success/error notices for refresh, tasks refresh, heal (with confirm).
3. Single Hermes chat instance (no dual conversation state).
4. Per-project chat history in component state; clear does not wipe project selection.
5. Session persistence for selected project id.
6. Hash navigation scrolls to panel ids.

## Remaining (ops / not code)

- Set public `HERMES_API_URL` so Send/Insights use Hermes (not Gemini fallback).
- Deploy financial Functions via GitHub Actions before Financials panel works in prod.
- Catalog projects stay offline until real hosting URLs + health are registered.
- Do **not** add Pause/Resume that stops Cloud Run without explicit product approval.

## Rollback

Revert the audit UX commit on the feature branch; no schema change required for UI-only fixes.
