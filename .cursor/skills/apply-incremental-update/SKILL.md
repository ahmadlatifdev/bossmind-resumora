---
name: apply-incremental-update
description: >-
  Applies tiny incremental patches to Resumora against the golden design baseline
  (v1.0.0-design-locked). Use when the user asks for any UI/design/layout change,
  bugfix, or "incremental update" so changes never start from scratch and never
  bypass Preflight → Patch → Validate → Commit.
---

# Apply Incremental Update (Golden Baseline)

Enforce this **4-step workflow for every single change**. Abort immediately if any step fails.

**Golden tag:** `v1.0.0-design-locked`  
**Live site:** `https://resumora.net`  
**Repo root:** `D:\BossMind\bossmind-resumora`

**Hard bans (also see `.cursor/rules/golden-baseline.mdc`):**

- NEVER overwrite `v1.0.0-design-locked` without explicit user approval.
- NEVER run `firebase deploy` or `gcloud run` manually. Only use `git push` to trigger GitHub Actions.
- NEVER modify `.env.local`, `bilibili_secrets.env`, or `firebase-service-account.json`.
- NEVER rewrite the site from scratch or replace locked chrome (`Layout`, `SiteHeader`, `SiteFooter`, `tokens.css`) without an intentional, approved design change.

---

## Step 1 — Preflight

1. Ensure working directory is the Resumora repo root.
2. Fetch tags if needed: `git fetch origin tag v1.0.0-design-locked --no-tags` (or `git fetch --tags`).
3. Confirm the tag exists: `git rev-parse v1.0.0-design-locked`.
4. Diff current tree / branch intent against the golden tag:

```powershell
git diff v1.0.0-design-locked -- .
```

5. **Critical-file gate.** If the proposed work would change any of these without the user explicitly naming them and approving, **STOP and ask**:

   - `src/app-shell.css`
   - `src/v6-luxury.css`
   - `src/styles/tokens.css`
   - `src/components/Layout.tsx`
   - `src/components/SiteHeader.tsx`
   - `src/components/SiteFooter.tsx`
   - `src/components/LanguageSwitcher.tsx`

6. Before writing new scripts, check `docs/DEPLOYMENT_MASTER_GUIDE.md` and search `scripts/` for an existing tool (`master-pipeline.ps1`, `safe-deploy.ps1`, `ui-consistency-check.js`).
7. Report Preflight result to the user (tag SHA, whether critical files are in scope, blockers).

If Preflight fails → **abort**. Do not patch.

---

## Step 2 — Patch

1. **Prompt the user for the _specific_ change** if the request is ambiguous (exact files + exact behavior).
2. Only modify the exact files requested / approved.
3. DO NOT touch unrelated files.
4. Prefer the smallest safe diff. Preserve luxury black/gold chrome and SSoT Layout.
5. Do not print secrets (`sk_live_`, `whsec_`, `pk_live_`, `price_` IDs, env values).

If the user has not approved critical-file edits and the patch needs them → **abort**.

---

## Step 3 — Validate

Run both checks from repo root. **If either fails, the skill MUST abort** (no commit instructions that imply success).

```powershell
npm run build
node scripts/ui-consistency-check.js --serve --compare-baseline artifacts/golden-baseline
```

Notes:

- If `artifacts/golden-baseline` is missing, run cross-page consistency only (`--serve`) and warn that golden baseline screenshots should be seeded from `v1.0.0-design-locked` via `scripts/export-golden-baseline.ps1`.
- Do not proceed to Commit while build or visual checks fail.
- Do not run local `firebase deploy` / `gcloud` to “validate.”

If Validate fails → **abort** and report exact failing command + summary.

---

## Step 4 — Commit (user-driven; 10-minute production gate)

Instruct the user to commit, tag an incremental design update, and push. **Do not commit unless the user explicitly asks.** Example instructions:

```powershell
git checkout -b fix/short-description
# stage ONLY the patched files
git add <exact-files>
git commit -m "fix: <short description>"
git tag v1.0.0-design-update-N
git push -u origin HEAD
git push origin v1.0.0-design-update-N
```

Explain that push opens/updates the PR path and triggers the standard **~10-minute production approval gate** in GitHub Actions (not a local deploy).

Optional pipeline entrypoints (still no local Firebase deploy):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\master-pipeline.ps1 -Mode Validate
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\safe-deploy.ps1 -WhatIf
```

---

## Success report checklist

After a completed run, report:

- Preflight: tag present / critical files in scope (yes/no)
- Files changed (exact paths)
- Validate: build + UI consistency (pass/fail)
- Next user action: commit / tag / push
- Confirmation: no secrets printed; no manual deploy executed
