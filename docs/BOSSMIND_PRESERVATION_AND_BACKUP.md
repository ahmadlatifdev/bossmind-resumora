# BossMind preservation, requirement lock, and rolling backup

This document describes **safe archive mode**, **30-day verified rolling backups**, **pre-deploy checkpoints**, and **recovery** for the **Resumora** repo. Other BossMind products (Master Admin, ElegancyArt, AI Video Generator, TikTok AI, Global Stock) live in **separate repositories** — register them in `config/bossmind-preservation-scope.json` under `externalRepositoriesRegistry` and back them up via **separate CI jobs** or `BOSSMIND_INDEX_ROOTS` with `npm run hub:index` (see `scripts/bossmind-hub-index.mjs`).

## Principles (non-negotiable)

- **Never delete or overwrite source** from backup scripts: operations are **copy-out** to `.bossmind/backups/` (gitignored) or a path you set with `BOSSMIND_BACKUP_ROOT`.
- **Prune only verified** daily run folders older than the retention window, and **never** remove a run that contains a `PERMANENT` marker file.
- **Protected latest manifest** lives under `rolling-30d/protected/latest-verified-manifest.json` and is updated only after a **successful hash verification** of the backup copy.
- **Secrets**: real `.env` files are never copied. Use `config/bossmind-env-structure.example.txt` as a **key-name template** only.
- **Immutability** of the luxury UI remains governed by `npm run bossmind:immutable:verify` and `config/bossmind-immutable-production-baseline.json` (see `docs/BOSSMIND_AUTONOMOUS_RUNTIME_SYNC.md`).

## Commands

| Command | Purpose |
|--------|---------|
| `npm run bossmind:backup:daily` | Full preservation snapshot + verify + prune (30d default). |
| `npm run bossmind:preservation:validate` | Read-only: compare workspace hashes to `protected/latest-verified-manifest.json`. |
| `npm run bossmind:deploy:checkpoint` | Lightweight copy before deploy (also runs inside `bossmind:deploy:gate` unless skipped). |
| `npm run bossmind:recovery:suggest` | Lists paths that differ vs manifest (optional `BOSSMIND_RECOVERY_RUN_ID`). |
| `npm run bossmind:recovery:apply` | Copies from a **verified** run; requires `BOSSMIND_RECOVERY_CONFIRM=APPLY_FROM_BACKUP` + `BOSSMIND_RECOVERY_RUN_ID`. |
| `npm run bossmind:checkpoint` | Git + optional Neon event (existing). |

## Environment variables

| Variable | Meaning |
|----------|---------|
| `BOSSMIND_BACKUP_ROOT` | Absolute or repo-relative root for rolling backups (default `.bossmind/backups/rolling-30d`). |
| `BOSSMIND_BACKUP_RETENTION_DAYS` | Default **30**. |
| `BOSSMIND_BACKUP_NO_PRUNE=1` | Skip prune pass (dry retention). |
| `BOSSMIND_DEPLOY_SKIP_CHECKPOINT=1` | Skip pre-deploy checkpoint in `bossmind-deploy-gate.mjs`. |
| `NEON_DATABASE_URL` | Optional: logs `bossmind.backup.daily.ok` / `failed` to `event_log`. |

## GitHub as secondary recovery

- Push **commits** and **tags** for stable releases; CI does not replace Git.
- Workflow **`.github/workflows/bossmind-daily-backup.yml`** runs backup + validate on a schedule (and `workflow_dispatch`). Add repository **secrets** (`NEON_DATABASE_URL`) only if you want Neon audit events from CI.

## Dormant systems

- Mark external repos **dormant** in `config/bossmind-preservation-scope.json` (`externalRepositoriesRegistry`) for operator visibility. **Dormant ≠ deleted** — clone and run the same backup scripts from each repo root when reactivating.

## Recovery apply (explicit human gate)

```bash
set BOSSMIND_RECOVERY_CONFIRM=APPLY_FROM_BACKUP
set BOSSMIND_RECOVERY_RUN_ID=2026-05-12T01-50-00-000Z
npm run bossmind:recovery:apply
```

Only paths present in that run’s `manifest.json` are restored from `runs/<id>/files/`. Run `npm run bossmind:immutable:verify` and tests after any restore.

## Requirement lock (organizational)

- Set team policy: **no production deploy** without `bossmind:deploy:gate`, **no UI drift** without `bossmind:baseline:seal` + review.
- `BOSSMIND_REQUIREMENT_LOCK=1` can be documented in your runbooks as a **human** freeze flag (CI branch protection + required checks).

## Index of automation (quick map)

- Runtime sync: `scripts/bossmind-runtime-sync.mjs`
- Autonomous controller: `scripts/bossmind-autonomous-runtime.mjs`
- Deploy gate: `scripts/bossmind-deploy-gate.mjs`
- Immutable UI: `scripts/bossmind-immutable-verify.mjs`, `scripts/bossmind-baseline-seal.mjs`
- Neon memory: `lib/shared/neon-memory.js`
- Protected surface: `config/bossmind-protected-surface.json`
