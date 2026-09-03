# Resumora Deployment Master Guide

**Project:** `resumora-live` · **Hosting site:** `client-resumora-live` · **Domain:** https://resumora.net  
**Golden design tag:** `v1.0.0-design-locked`

Related: [DEPLOYMENT_WORKFLOW.md](./DEPLOYMENT_WORKFLOW.md) (zero manual deploy, GitHub environment approval).

---

## Incremental Update Protocol

**No change should ever be deployed from scratch.** Every production change is a tiny incremental patch on top of the approved design, validated locally, then shipped only through the automated pipeline.

### Principles

1. Start from the live/approved baseline (`v1.0.0-design-locked` + current `main`), never a blank redesign.
2. Patch only the exact files needed for the requested change.
3. Validate with `npm run build` and Playwright UI consistency / golden baseline compare.
4. Commit, tag an incremental update (`v1.0.0-design-update-N`), and `git push` to open the PR path.
5. Production goes live only after GitHub Actions + the ~10-minute **production** environment approval gate.

### Forbidden

| Action                                                                                   | Why                                    |
| ---------------------------------------------------------------------------------------- | -------------------------------------- |
| Local `firebase deploy` / manual `gcloud run`                                            | Bypasses approval gate and audit trail |
| Overwriting `v1.0.0-design-locked` without explicit approval                             | Destroys the golden baseline           |
| Editing `.env.local`, `bilibili_secrets.env`, `firebase-service-account.json` via agents | Secret / credential risk               |
| Replacing Layout / SiteHeader / tokens “from scratch”                                    | Breaks SSoT chrome                     |

### Agent skill

Use Cursor skill **`apply-incremental-update`** (`.cursor/skills/apply-incremental-update/SKILL.md`):

1. **Preflight** — `git diff v1.0.0-design-locked -- .` and critical-file gate
2. **Patch** — exact files only
3. **Validate** — build + `scripts/ui-consistency-check.js`
4. **Commit** — user commits, tags, pushes → Actions + 10-minute gate

Rule file: `.cursor/rules/golden-baseline.mdc` (always applied).

### Critical chrome files (require intentional approval)

- `src/app-shell.css`
- `src/v6-luxury.css`
- `src/styles/tokens.css`
- `src/components/Layout.tsx`
- `src/components/SiteHeader.tsx`
- `src/components/SiteFooter.tsx`
- `src/components/LanguageSwitcher.tsx`

PRs that touch these without `[Intentional Design Change]` in the title are blocked by `.github/workflows/ui-regression.yml`.

### Local validation commands

```powershell
cd D:\BossMind\bossmind-resumora
npm run build
node scripts/ui-consistency-check.js --serve --compare-baseline artifacts/golden-baseline
```

Seed or refresh the committed golden screenshots (after an approved design lock):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\export-golden-baseline.ps1
```

Pipeline helpers (validate / push guidance only — **no local Firebase deploy**):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\master-pipeline.ps1 -Mode Validate
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\safe-deploy.ps1 -WhatIf
```

### Production path (automated only)

```
Patch branch → PR → ui-regression + other checks → merge to main
  → GitHub Actions deploy-prod → production environment wait (~10 min approval)
  → Firebase Hosting / Functions via CI
```

Never claim production is updated until Actions shows a successful deploy after approval.

### Security

- Do not print `sk_live_`, `whsec_`, `pk_live_`, or `price_` IDs.
- Stripe and other secrets stay in GitHub Secrets / Firebase Secret Manager / central vault key names only.
- Never paste a Firebase service-account JSON into chat, commits, or screenshots.

---

## FIREBASE_SERVICE_ACCOUNT — set / rotate (required for CI Hosting)

CI Hosting Production and Preview **fail** if `FIREBASE_SERVICE_ACCOUNT` is missing or empty (0-byte). The secret _name_ can appear in `gh secret list` while the _value_ is still blank — always verify with a successful workflow step, not the list alone.

### 1) Obtain a JSON key (local file only)

Preferred path on disk (gitignored; never commit):

`D:\BossMind\bossmind-resumora\firebase-service-account.json`

If the file is missing:

1. Open [Google Cloud Console → IAM & Admin → Service Accounts](https://console.cloud.google.com/iam-admin/serviceaccounts?project=resumora-live) for project **`resumora-live`**.
2. Use (or create) a deploy SA with Firebase Hosting Admin + needed Functions/Run roles (same SA your team already uses for Hosting).
3. **Keys → Add Key → Create new key → JSON** → save as `firebase-service-account.json` in the repo root (or Downloads, then move).
4. Confirm size is **non-zero** (typical key files are several KB):

```powershell
Get-Item .\firebase-service-account.json | Select-Object FullName, Length
```

If org policy blocks key creation (`iam.disableServiceAccountKeyCreation`), ask an org admin to allow a one-time key or switch the workflow to Workload Identity Federation (preferred long-term). Do not paste JSON into Cursor chat.

### 2) Upload to GitHub Actions secrets (CLI)

From the repo root, with `gh` authenticated (`gh auth status`):

```powershell
cd D:\BossMind\bossmind-resumora
gh secret set FIREBASE_SERVICE_ACCOUNT --repo ahmadlatifdev/bossmind-resumora < .\firebase-service-account.json
```

Confirm the secret **name** exists (values are never shown):

```powershell
gh secret list --repo ahmadlatifdev/bossmind-resumora
```

### 3) Upload via GitHub UI (if `gh` is unavailable)

1. Open https://github.com/ahmadlatifdev/bossmind-resumora/settings/secrets/actions
2. **New repository secret** (or update existing)
3. Name: `FIREBASE_SERVICE_ACCOUNT`
4. Value: paste the **full JSON** from the key file (from your editor — not into chat)
5. **Add secret**

### 4) Redeploy via Actions (no local `firebase deploy`)

```powershell
gh workflow run "Deploy Firebase Hosting Production" --repo ahmadlatifdev/bossmind-resumora
gh run list --repo ahmadlatifdev/bossmind-resumora --workflow "Deploy Firebase Hosting Production" --limit 5
```

1. Open the new run in Actions.
2. Approve the **production** environment gate (~10 minutes wait timer if configured).
3. Confirm the step `Verify Firebase service account secret is configured` prints that the secret is configured (not “missing”).
4. Confirm Hosting deploy succeeds, then verify https://resumora.net.

### 5) Rotate / revoke

1. Upload a **new** JSON key with `gh secret set` (same name overwrites).
2. In GCP, disable/delete the old key.
3. Re-run `deploy-prod` once to prove CI still works.
4. Delete local copies of old JSON keys from Downloads/Desktop when done.

### Preview workflow note

`deploy-preview.yml` also needs a non-empty `FIREBASE_SERVICE_ACCOUNT` (same secret). Fixing Production secret fixes Preview failures that report `firebaseServiceAccount` input missing/empty.

---

## Permanent Automation Bootstrap

Resumora heals an empty/missing `FIREBASE_SERVICE_ACCOUNT` without pasting JSON into chat.

### Local healer — `scripts/bootstrap-secrets.ps1`

1. Requires non-empty `firebase-service-account.json` in the repo root (gitignored).
2. Lists GitHub secret **names** only via `gh secret list`.
3. Uploads/refreshes `FIREBASE_SERVICE_ACCOUNT` (and `FIREBASE_SERVICE_ACCOUNT_BACKUP`) with `gh secret set` from the local file (values never printed).
4. Checks `BILIBILI_SESSDATA` length in `bilibili_secrets.env` is `>= 40` (length only).
5. Exits with failure if the local service-account file is missing or too small.

`scripts/master-pipeline.ps1` runs this as **Step 0** before build/UI checks and aborts the pipeline if bootstrap fails.

```powershell
cd D:\BossMind\bossmind-resumora
powershell -ExecutionPolicy Bypass -File .\scripts\bootstrap-secrets.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\master-pipeline.ps1 -Mode BootstrapOnly
```

### Scheduled guard — `.github/workflows/secret-health.yml`

- Daily cron + `workflow_dispatch`.
- Measures secret **length** in the runner (never prints content).
- If primary is empty and `FIREBASE_SERVICE_ACCOUNT_BACKUP` is non-empty, restores primary using `SECRET_SYNC_TOKEN` (PAT with `secrets:write` — `GITHUB_TOKEN` cannot set Actions secrets).
- If restore is impossible: job **fails loudly**; optional email via `RESEND_API_KEY` + `ALERT_EMAIL_TO` + `ALERT_EMAIL_FROM`.

**Never** store the service-account JSON in git. Backup lives only as a GitHub Actions secret.

### Unblock CI right now

```powershell
cd D:\BossMind\bossmind-resumora
# 1) Ensure firebase-service-account.json exists (non-zero bytes), then:
powershell -ExecutionPolicy Bypass -File .\scripts\bootstrap-secrets.ps1

# 2) Trigger production deploy workflow (Actions UI approval still required):
gh workflow run "Deploy Firebase Hosting Production" --repo ahmadlatifdev/bossmind-resumora
gh run list --repo ahmadlatifdev/bossmind-resumora --workflow "Deploy Firebase Hosting Production" --limit 5
```

After the run appears in Actions, **approve the production environment gate**. No local `firebase deploy`.

---

## Declarative Deployment (Skaffold + Cloud Deploy)

Reproducible **first-try** Cloud Run releases via Google Cloud Deploy, integrated into `.github/workflows/deploy-prod.yml`. Resolves recurring IAM drift and Secret Manager permission gaps by applying roles idempotently before CI runs.

### Architecture

| Component          | Path                                      | Purpose                                              |
| ------------------ | ----------------------------------------- | ---------------------------------------------------- |
| IAM bootstrap      | `scripts/setup-deploy-iam.ps1`            | Project + secret-level roles for deploy SA           |
| Skaffold config    | `skaffold.yaml`                           | Declarative Cloud Run manifest deploy                |
| Cloud Run manifest | `deploy/cloud-run-service.yaml`           | Knative Service (canary + template)                  |
| Cloud Deploy       | `clouddeploy.yaml`                        | `resumora-production-pipeline` → `production` target |
| CI job             | `declarative-deploy` in `deploy-prod.yml` | OIDC → `gcloud deploy apply` → release create        |

### One-time IAM setup (local, keyless)

```powershell
cd D:\BossMind\bossmind-resumora
powershell -ExecutionPolicy Bypass -File .\scripts\setup-deploy-iam.ps1
```

Default deploy SA: `gh-oidc-sa@resumora-live.iam.gserviceaccount.com` (same as GitHub OIDC). Optional dedicated SA:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup-deploy-iam.ps1 -CreateDedicatedDeploySa
```

**Verify bindings are active:**

```powershell
gcloud projects get-iam-policy resumora-live `
  --flatten="bindings[].members" `
  --filter="bindings.members:serviceAccount:gh-oidc-sa@resumora-live.iam.gserviceaccount.com" `
  --format="table(bindings.role)"
```

Required roles (applied by script):

- `roles/secretmanager.secretAccessor` — Secret Manager version access
- `roles/run.developer` — Cloud Run revision deploy
- `roles/run.admin` — Cloud Run service admin
- `roles/secretmanager.viewer` — `secrets.get` during Firebase Functions deploy
- `roles/clouddeploy.admin` — pipeline apply + release create

### Validate Cloud Deploy pipeline

```powershell
gcloud deploy pipelines list --region=us-central1 --project=resumora-live
gcloud deploy targets list --region=us-central1 --project=resumora-live
gcloud deploy releases list --delivery-pipeline=resumora-production-pipeline --region=us-central1 --project=resumora-live
```

Manual apply (optional; CI runs this automatically):

```powershell
gcloud deploy apply --file=clouddeploy.yaml --region=us-central1 --project=resumora-live
gcloud deploy releases create "rel-manual-$(Get-Date -Format yyyyMMddHHmm)" `
  --delivery-pipeline=resumora-production-pipeline `
  --region=us-central1 `
  --project=resumora-live `
  --skaffold-file=skaffold.yaml
```

The `production` target has **`requireApproval: true`** — approve the release in [Cloud Deploy Console](https://console.cloud.google.com/deploy/delivery-pipelines?project=resumora-live) after CI creates it.

### CI flow (zero manual terminal deploy)

```
push main → build → declarative-deploy (Cloud Deploy release)
                 → deploy (Firebase Functions + Firestore rules + Hosting blue-green)
```

Both jobs use the **production** GitHub environment gate (~10 min approval). No local `firebase deploy` or `gcloud run deploy`.

### Push and monitor

```powershell
git push origin main
gh run list --repo ahmadlatifdev/bossmind-resumora --workflow "Deploy Firebase Hosting Production" --limit 5
gh run watch --repo ahmadlatifdev/bossmind-resumora
```

### Security

- Never commit service-account JSON or Stripe secret values.
- Do not print `sk_live_`, `whsec_`, `pk_live_`, or `price_` IDs.
- OIDC only — no long-lived keys in GitHub Secrets for GCP auth.

---

## Unified Harness (Master Admin + Hermes)

The Master Admin Dashboard (`/admin/master`) is the BossMind control plane for five catalog projects: **resumora**, **elegancyart**, **ai-video**, **tiktok-ai**, **global-stock**.

### Architecture

| Layer                             | Role                                                                                                             |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Firestore `projects`              | Registry docs: `projectId`, `name`, `status`, `lastDeployTime`, non-secret `envRegistry`, `healthScore`, `tools` |
| `GET /api/admin/master-projects`  | Admin-password protected registry + health aggregate                                                             |
| `GET /api/admin/master-dashboard` | Existing ops dashboard **plus** `harness` block                                                                  |
| `POST /api/admin/hermes-command`  | Project-scoped harness command (skills → Hermes → Gemini fallback)                                               |
| UI `#orchestration`               | Status cards + per-project command chat (behind `AdminAuthGate`)                                                 |

Client SDK cannot read/write `projects` (Firestore default deny). Only Admin SDK / Cloud Functions.

### Seed / secrets

```powershell
# Create Secret Manager containers (names only — you add versions)
powershell -ExecutionPolicy Bypass -File .\scripts\setup-secrets.ps1 -WhatIf
powershell -ExecutionPolicy Bypass -File .\scripts\setup-secrets.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\setup-deploy-iam.ps1
```

Key names used by the harness (never commit values): `HERMES_API_KEY`, `HERMES_API_SERVER_KEY`, `GEMINI_API_KEY`, `ALPHA_VANTAGE_KEY`.

See also: `docs/HERMES_INTEGRATION.md`.

---

## See also

- `docs/DEPLOYMENT_WORKFLOW.md` — zero manual deploy, branch protection, environment reviewers
- `docs/CLIENT_ORIGINAL_LOCK.md` — locked client originals
- `docs/AUTOMATION_HEALTH_SCORECARD.md` — CI success metrics / empty-SA findings
- `.github/workflows/ui-regression.yml` — golden baseline visual gate
- `.github/workflows/ui-consistency.yml` — cross-page header/footer SSoT check
- `.github/workflows/secret-health.yml` — daily FIREBASE_SERVICE_ACCOUNT length/restore guard
- `docs/SECURITY_DEFENSE_IN_DEPTH.md` — edge, zero-trust, and monitoring layers
- `clouddeploy.yaml` / `skaffold.yaml` — declarative Cloud Run pipeline
- `docs/MASTER_BACKUP_GUIDE.md` — encrypted System Master Backup (new Windows PC restore)
