# Immutable production design lock (Resumora)

This repository implements a **practical** locked baseline: **checksums + on-disk snapshots + routing authority + CI scripts**. It does **not** replace Render/Railway rollback buttons, Neon row-level UI enforcement, or a hosted visual-diff farm unless you add those separately.

## Single source of truth

| Artifact | Role |
|----------|------|
| `config/bossmind-immutable-production-baseline.json` | **Enabled** baseline: sealed hashes, optional `lockedProductionMode`, `productionPublicOrigin`, `enforcementContract`. |
| `config/bossmind-baseline-snapshots/luxury-v1/**` | **Rollback-authoritative copies** of the interface paths listed in the baseline (git-tracked). |
| `config/bossmind-protected-ui-authority.json` | **Routing/layout authority**: canonical `HomePage`, required HTML markers for probes, duplicate-home detection. |
| `config/bossmind-protected-surface.json` + registry | **Anti-deletion** list for locked routes and shell files. |

Silent overwrite of snapshots is prevented the same way as all source: **git + code review**. Restoring files is explicit: `npm run bossmind:baseline:restore`.

## Commands (enforcement)

| Command | When to use |
|---------|-------------|
| `npm run bossmind:locked-production:verify` | **Design lock**: structural single-home authority + `bossmind-immutable-verify` (checksums + optional live marker probe). |
| `npm run bossmind:deploy:gate` | **Pre-deploy**: checkpoint, hosting policy, forbidden UI scan, protected surface, immutable verify, anti-leak, lint, production build, optional UI probe. |
| `npm run bossmind:completion:gate` | **Task closure / post-merge**: broader validation including build + optional live homepage probe. |
| `npm run bossmind:baseline:seal` | **After explicit approval** of a new public UI: refresh hashes + refresh `luxury-v1` snapshots. |
| `npm run bossmind:baseline:restore` | **Recovery**: copy snapshot files back into the workspace (then commit). |

## Locked production mode flag

`bossmind-immutable-production-baseline.json` includes:

- `"lockedProductionMode": true` — informational default; seal preserves it unless set to `false` before sealing.
- `"enforcementContract"` — pointers to the npm scripts above and override env names.

## What is **not** done automatically here

- **GitHub vs production file diff** for every asset (use your deploy platform’s release diff + commit SHA).
- **Automatic production rollback** when drift is detected (operator/CI with Render API or redeploy previous image).
- **Visual AI / pixel diff** against golden screenshots (optional: extend `pages/api/orchestration/screenshots.js` + external storage; not shipped as a blocking gate in this repo).
- **Continuous runtime mutation of live HTML** to “heal” drift (would be unsafe without strong service identity).

## Optional live probe

Set `BOSSMIND_IMMUTABLE_PROBE_ORIGIN=https://resumora.net` (or `BOSSMIND_IMMUTABLE_PROBE_FROM_LOCK=1` to use `productionPublicOrigin` from the baseline JSON) when running `bossmind:locked-production:verify` or `bossmind:immutable:verify`. The probe:

1. Checks `requiredHomeHtmlMarkers` from `bossmind-protected-ui-authority.json`.
2. Runs **footer anti-drift** rules (`lib/orchestration/bossmind-footer-live-drift.js`): fails if live HTML still contains removed trust-chip rows, “Connect Neon…”, “Trust & signals” / “Confiance & signaux”, or is missing the simplified footer signals (`aria-label` for the CTA toolbar, `#footer-official-social`, `rs-foot-engage-v2`).

If the probe fails while local checksums pass, production is serving an **older build** — on **Render**, trigger a **clean rebuild** (clear build cache) and redeploy the commit that contains the approved `FooterEngagementDock.jsx`, then re-run the probe.

`npm run bossmind:completion:gate` with `BOSSMIND_COMPLETION_LIVE_PROBE=1` applies the same footer checks after deploy.

## Explicit approval path

Intentional UI drift: `BOSSMIND_BASELINE_OVERRIDE=1` for verify scripts, then **`npm run bossmind:baseline:seal`** and commit the updated baseline + snapshots.

## Related

- `docs/PROTECTED_COMPONENTS_REGISTRY.md`
- `docs/BOSSMIND_TASK_COMPLETION_GATE.md`
- `docs/RAILWAY_DEPLOY.md`
