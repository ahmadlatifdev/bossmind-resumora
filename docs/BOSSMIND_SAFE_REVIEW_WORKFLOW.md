# BossMind safe review workflow (Cursor agents)

Purpose: constrain automated editors to **review / validate / surgical fixes** and avoid bulldozing approved **Resumora** UX, Stripe flows, locale, or memory architecture.

This file is mirrored in Cursor rules at `.cursor/rules/bossmind-resumora.mdc`. Windsurf is dropped from the BossMind stack; use Cursor only.

## Operating mode

- **ALLOWED:** review diffs; fix build/lint/runtime; fix missing imports; spacing/alignment/responsive tweaks; incremental EN/FR string fixes; guarded additions behind existing patterns.
- **DISALLOWED without explicit human approval:** full layout redesigns; mass component rewrites; deleting working features; changing Stripe semantics (tier mapping, webhook contract, checkout metadata keys); refactoring shared-memory schemas casually; ripping navigation/footer/policy structure.

## Mandatory pre-edit checkpoint (Git)

Before large or risky edits:

1. **Non-destructive** (recommended default) — prints HEAD/branch + logs to Neon when configured:

```bash
npm run bossmind:checkpoint
```

2. **Git stash WIP** (only when intentional — restores via `stash pop`):

```bash
npm run bossmind:checkpoint -- --stash
```

Restore after stash:

```bash
git stash list
git stash pop
```

## Validation chain (before merging agent output)

1. `git diff` — scope sanity.
2. `npm run lint`
3. `npm run build`
4. `npm run validate:runtime` (Neon optional)
5. Local `npm run dev` — smoke EN/FR, pricing click path, footer engagement.

## Anti-leak & conflict signals

Use orchestration + file-guard per `docs/BOSSMIND_ORCHESTRATION.md`:

- Pre-edit **rollback snapshot** for targeted files via `snapshotBeforeEdit` / file-guard API.
- Watch for **route collisions**, **hydration warnings**, and **removed approved strings** in review.

## Protected surface

Canonical list: `docs/PROTECTED_COMPONENTS_REGISTRY.md`.
