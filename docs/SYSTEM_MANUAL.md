# BossMind System Manual ΓÇö Resumora

> **Auto-generated.** This file is a template. The live manual is stored in Firestore (`system_manual/current`) and refreshed by the `updateSystemManual` Cloud Function and GitHub Actions.

## Current Status

Run **Regenerate Manual Now** on [/admin/system-health](https://resumora.net/admin/system-health) or wait for the weekly cron / post-deploy pipeline.

## Recent Changes

See [CHANGELOG.md](../CHANGELOG.md) for code changes (auto-generated on merge to `main`).

## Pipeline

| Component         | Trigger                                                                      |
| ----------------- | ---------------------------------------------------------------------------- |
| `CHANGELOG.md`    | `.github/workflows/auto-changelog.yml` on PR merge                           |
| System manual     | `updateSystemManual` function + `.github/workflows/update-system-manual.yml` |
| Production deploy | `.github/workflows/deploy-prod.yml` (production environment gate)            |

## Security

- No `sk_live_`, `whsec_`, `pk_live_`, `price_`, or `BILIBILI_*` values are written to this manual.
- Regeneration requires admin password (`X-Admin-Password`) or CI secrets.
