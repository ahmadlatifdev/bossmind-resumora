# BossMind immutable luxury baseline snapshots

This directory holds **read-only copies** of the sealed luxury marketing interface (HomePage, panels, shell, i18n, tokens, route manifests). They are produced by:

```bash
npm run bossmind:baseline:seal
```

**Restore** (working tree only — does not rewrite `.git`; commit the result yourself):

```bash
set BOSSMIND_BASELINE_RESTORE_CONFIRM=RESTORE_IMMUTABLE_BASELINE
npm run bossmind:baseline:restore
```

Checksums live in `config/bossmind-immutable-production-baseline.json`. After any **explicitly approved** UI change, re-run seal and commit both the JSON and updated files under `luxury-v1/`.
