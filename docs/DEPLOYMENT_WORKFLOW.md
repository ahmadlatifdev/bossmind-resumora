# Resumora Production Deployment Workflow

**Project:** `resumora-live` ┬╖ **Site:** `client-resumora-live` ┬╖ **Domain:** https://resumora.net

Production deploys are **never** run from a local terminal. All live changes go through GitHub: Pull Request ΓåÆ merge ΓåÆ GitHub Actions ΓåÆ **production** environment approval.

---

## Policy summary

| Action                       | Allowed locally? | Approved path                                                           |
| ---------------------------- | ---------------- | ----------------------------------------------------------------------- |
| `firebase deploy`            | **No**           | GitHub Actions after PR merge                                           |
| `gcloud run services update` | **No** (local)   | **Automated in CI** after self-heal function deploy (`deploy-prod.yml`) |
| `git push origin main`       | **No**           | PR merge only                                                           |
| `npm run build`              | Yes              | Local verification before PR                                            |
| Preview hosting              | N/A              | Automatic on PR (`deploy-preview.yml`)                                  |

Local guard: `scripts/guard-deploy.ps1` + PowerShell profile wrappers + `.git/hooks/pre-push`.

---

## One-time setup

Run from repo root (all four steps):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\finalize-zero-manual-deploy.ps1
```

Or step-by-step:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\finalize-zero-manual-deploy.ps1 -Step1Only
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\finalize-zero-manual-deploy.ps1 -Step2Only
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\finalize-zero-manual-deploy.ps1 -Step3Only
```

Dry-run GitHub API calls:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\finalize-zero-manual-deploy.ps1 -Step2Only -WhatIf
```

### gh CLI equivalents (Steps 2-3)

Replace `OWNER/REPO` and `USER_ID` if not using the finalize script.

**Step 2 - production environment:**

```powershell
$owner = "ahmadlatifdev"
$repo  = "bossmind-resumora"
$userId = (gh api user --jq .id)

@{
  wait_timer = 10
  prevent_self_review = $false
  reviewers = @(@{ type = "User"; id = [int64]$userId })
  deployment_branch_policy = @{
    protected_branches = $false
    custom_branch_policies = $true
  }
} | ConvertTo-Json -Depth 5 -Compress |
  gh api --method PUT "repos/$owner/$repo/environments/production" --input -

gh api --method POST "repos/$owner/$repo/environments/production/deployment-branch-policies" `
  -f "name=main" -f "type=branch"
```

**Step 3 - branch protection on main:**

```powershell
@{
  enforce_admins = $true
  required_pull_request_reviews = @{
    dismiss_stale_reviews = $true
    require_code_owner_reviews = $false
    required_approving_review_count = 1
  }
  required_conversation_resolution = $true
  allow_force_pushes = $false
  allow_deletions = $false
  required_status_checks = $null
  restrictions = $null
} | ConvertTo-Json -Depth 5 -Compress |
  gh api --method PUT "repos/$owner/$repo/branches/main/protection" --input -
```

Optional status check after first PR preview run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\finalize-zero-manual-deploy.ps1 -Step3Only `
  -RequiredStatusChecks "Deploy Firebase Hosting Preview / build_and_preview"
```

**Manual UI fallback (Step 2):** Repo -> **Settings** -> **Environments** -> **New environment** (name: `production`) -> **Configure environment** -> Required reviewers, Deployment branches (`main`), Wait timer (10 min), URL `https://resumora.net`.

**Manual UI fallback (Step 3):** Repo -> **Settings** -> **Branches** -> **Add branch protection rule** -> Branch name pattern `main` -> Require PR, 1 approval, enforce for administrators.

**Note:** In the environment UI, also disable **Allow administrators to bypass protection rules** if shown (`can_admins_bypass` may remain true via API on some plans).

---

## Standard shipping workflow (copy/paste)

Replace `feature/my-change` and the commit message with your work.

```powershell
# 0) Start from latest main
git fetch origin
git checkout main
git pull origin main

# 1) Feature branch
git checkout -b feature/my-change

# 2) Develop + verify locally (no deploy)
npm ci
npm run build

# 3) Commit
git add -A
git commit -m "feat: describe your change"

# 4) Push branch (NOT main)
git push -u origin feature/my-change
```

**On GitHub:**

1. Open a **Pull Request** ΓåÆ base: `main`.
2. Wait for **Deploy Firebase Hosting Preview** check (if configured).
3. Review ΓåÆ **Approve** ΓåÆ **Merge pull request**.

**After merge:**

1. Open **Actions** ΓåÆ **Deploy Firebase Hosting Production**.
2. Wait for the **build** job to finish.
3. The **deploy** job pauses on the **production** environment:
   - **Wait timer:** 10 minutes (cancel here if merge was a mistake).
   - **Required reviewer:** click **Review deployments** ΓåÆ **Approve**.
4. Deploy completes ΓåÆ live at https://resumora.net

---

## Workflow diagram

```
feature branch ΓöÇΓöÇpushΓöÇΓöÇΓû║ GitHub PR ΓöÇΓöÇmergeΓöÇΓöÇΓû║ main
                                                  Γöé
                                                  Γû╝
                                    deploy-prod.yml (build job)
                                                  Γöé
                                                  Γû╝
                              production environment gate
                              (10 min wait + reviewer approve)
                                                  Γöé
                                                  Γû╝
                              Firebase Hosting live (resumora.net)
```

---

## GitHub configuration reference

### Environment: `production`

| Setting             | Value                |
| ------------------- | -------------------- |
| URL                 | https://resumora.net |
| Required reviewers  | Your GitHub user     |
| Deployment branches | `main` only          |
| Wait timer          | 10 minutes           |

**Automated (gh CLI):** see `scripts/finalize-zero-manual-deploy.ps1 -Step2`

**Manual path:** Repo ΓåÆ **Settings** ΓåÆ **Environments** ΓåÆ **production** (or **Production**) ΓåÆ **Configure environment** ΓåÆ enable protection rules above.

### Branch protection: `main`

| Setting                    | Value                                                           |
| -------------------------- | --------------------------------------------------------------- |
| Require pull request       | Yes                                                             |
| Required approvals         | 1                                                               |
| Enforce for administrators | Yes                                                             |
| Status checks              | Optional: `Deploy Firebase Hosting Preview / build_and_preview` |

**Automated (gh CLI):** see `scripts/finalize-zero-manual-deploy.ps1 -Step3`

**Manual path:** Repo ΓåÆ **Settings** ΓåÆ **Branches** ΓåÆ **Add branch protection rule** ΓåÆ branch name `main`.

---

## Required GitHub Secrets (names only)

Configure under **Settings ΓåÆ Secrets and variables ΓåÆ Actions**:

- `FIREBASE_SERVICE_ACCOUNT` ΓÇö Firebase/GCP deploy auth (CI only)
- `VITE_FIREBASE_*` ΓÇö client build vars
- `VITE_STRIPE_PUBLISHABLE_KEY` ΓÇö publishable key only (never secret keys in repo)
- `VITE_STRIPE_PRICE_*` ΓÇö price IDs via secrets (never commit or log values)

Never paste `sk_live_`, `whsec_`, or raw service-account JSON into the repo or chat.

---

## Local verification commands

After restarting PowerShell (or running `. $PROFILE`):

```powershell
# Guard status
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\guard-deploy.ps1 -CheckOnly

# Wrappers loaded? (should show CommandType = Function)
Get-Command firebase, gcloud | Format-Table Name, CommandType -AutoSize

# Block test (expect exit code 1 + policy message)
firebase deploy --only hosting --project resumora-live
echo "Exit code: $LASTEXITCODE"
```

---

## Emergency break-glass (avoid if possible)

Only when CI is down and production must be fixed immediately:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\issue-deploy-token.ps1
# Type: APPROVE BREAK-GLASS
# Token valid ~15 minutes ΓÇö then guarded commands may run
```

Direct push to main (also break-glass):

```powershell
$env:RESUMORA_ALLOW_MAIN_PUSH = "1"
git push origin main
```

Document every break-glass use in your team log.

---

## Related files

| File                                      | Purpose                                               |
| ----------------------------------------- | ----------------------------------------------------- |
| `scripts/guard-deploy.ps1`                | Blocks local deploy commands                          |
| `scripts/install-deploy-guard.ps1`        | Profile + pre-push hook installer                     |
| `scripts/finalize-zero-manual-deploy.ps1` | Steps 1ΓÇô3 automation + gh setup                     |
| `.github/workflows/deploy-prod.yml`       | Production hosting + self-heal functions + IAM bypass |
| `.github/workflows/deploy-preview.yml`    | PR preview channel                                    |
| `scripts/git-hooks/pre-push`              | Blocks local push to `main`                           |

---

## Functions / Cloud Run (self-heal)

Self-heal functions deploy **automatically** in the approved `deploy-prod.yml` **production** job:

1. **Deploy functions:** `getSystemHealth`, `runSystemHealth`, `decideSystemHeal`, `selfHealMonitor`
2. **IAM bypass (automated):** `--no-invoker-iam-check` on Cloud Run services:
   - `getsystemhealth`
   - `runsystemhealth`
   - `decidesystemheal`

`selfHealMonitor` is a **Cloud Scheduler** job (not public HTTP) ΓÇö it is deployed but **does not** receive the IAM bypass.

No local `gcloud run services update` or break-glass token is required for these three services after CI is configured.

### Verify IAM step in GitHub Actions

1. Open **Actions** ΓåÆ **Deploy Firebase Hosting Production** ΓåÆ latest run.
2. Expand the **deploy** job (after production environment approval).
3. Open **Apply Cloud Run IAM bypass (self-heal HTTP services)**.
4. Confirm log lines like:
   - `Applying --no-invoker-iam-check to Cloud Run service: getsystemhealth`
   - `IAM bypass applied to getsystemhealth, runsystemhealth, decidesystemheal.`
5. Step must show a green check; any `gcloud run services update failed` means the deploy job failed.

Break-glass tokens remain for **other** Cloud Run services or emergencies only.

See `docs/SELF_HEAL.md` for function export names.
