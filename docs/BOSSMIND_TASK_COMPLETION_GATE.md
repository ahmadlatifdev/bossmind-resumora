# BossMind task completion and production enforcement (Resumora)

This document defines **what the repository can enforce automatically** versus what still requires **your hosting provider (Render / Railway) and human approval**.

## What is enforced in-repo

| Command | Purpose |
|---------|---------|
| `npm run bossmind:completion:gate` | Full **task-completion** pipeline: forbidden UI source scan → hosting guard → protected surface → anti-leak → lint → **production build** → immutable baseline verify → optional **live** homepage marker probe. |
| `npm run bossmind:deploy:gate` | Pre-deploy gate (includes forbidden UI scan + checkpoint + immutable + build). Prefer this before merging UI that must ship. |
| `npm run bossmind:forbidden-ui:scan` | Fast guard only: marketing components must not reintroduce `ThumbsUp` / `ThumbsDown` or `footerEngageDislike` bindings. |
| `npm run bossmind:immutable:verify` | Sealed luxury checksums; optional production HTML marker probe via `BOSSMIND_IMMUTABLE_PROBE_ORIGIN`. |
| `npm run bossmind:ui-probe` | Local/preview HTTP checks; homepage expects simplified footer (`rs-footer-engage-dock`, `#footer-official-social`, CTA pills). |

## Optional live production confirmation

CI or a release engineer can require a **live** check so “done” is not only “green in git”:

```bash
set BOSSMIND_COMPLETION_LIVE_PROBE=1
set BOSSMIND_COMPLETION_PROBE_ORIGIN=https://resumora.net
npm run bossmind:completion:gate
```

On Unix:

```bash
BOSSMIND_COMPLETION_LIVE_PROBE=1 BOSSMIND_COMPLETION_PROBE_ORIGIN=https://resumora.net npm run bossmind:completion:gate
```

The probe `GET /` must return **200** and include section/footer markers for the current approved public shell (including trust chips). If production is still serving an older build, this **fails by design**.

## Escape hatches (explicit only)

| Variable | Effect |
|----------|--------|
| `BOSSMIND_COMPLETION_SKIP_LINT=1` | Skip ESLint in completion gate. |
| `BOSSMIND_COMPLETION_SKIP_IMMUTABLE=1` | Skip immutable verify (**emergency only**; follow with `npm run bossmind:baseline:seal` after approved UI drift). |
| `BOSSMIND_SKIP_ANTILEAK=1` | Skip anti-leak (same semantics as other BossMind scripts). |
| `BOSSMIND_DEPLOY_GATE_SKIP_IMMUTABLE=1` | Skip immutable step inside **deploy** gate only. |
| `BOSSMIND_BASELINE_OVERRIDE=1` | Immutable verify exits 0 on checksum mismatch (**explicit approval**; re-seal after intentional changes). |

## What is **not** done automatically (by design)

- **Auto-redeploy** to Render/Railway when drift is detected (requires service tokens, branch policy, and rollback ownership).
- **Autonomous visual diff** of screenshots vs golden images (optional future: wire Playwright + artifact store; not enabled here).
- **Blocking Cursor or chat “task completed” labels** — use this document and CI so **human and pipeline** definitions of “done” include `bossmind:completion:gate` (+ live probe when shipping public UI).

## Recommended CI placement

1. On pull requests that touch `components/marketing/**`, `pages/**`, or `styles/resumora-global.css`: at minimum `npm run bossmind:forbidden-ui:scan` and `npm run lint`.
2. On release/main deploy pipelines: `npm run bossmind:deploy:gate` or `npm run bossmind:completion:gate` with `BOSSMIND_COMPLETION_LIVE_PROBE=1` after deploy job succeeds (or as a scheduled post-deploy job).

## Related docs

- `docs/PROTECTED_COMPONENTS_REGISTRY.md` — locked surfaces and baseline policy.
- `docs/RAILWAY_DEPLOY.md` — Render/Railway/Neon topology.
- `docs/BOSSMIND_SAFE_REVIEW_WORKFLOW.md` — review discipline before wide edits.
