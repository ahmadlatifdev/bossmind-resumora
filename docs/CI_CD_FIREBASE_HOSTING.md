# GitHub Actions → Firebase Hosting (resumora-live / client-resumora-live / resumora.net)

#

# Workflows:

# .github/workflows/deploy-preview.yml — PR → preview channel (no approval gate)

# .github/workflows/deploy-prod.yml — push to main → build, then gated live deploy

#

# Never commit: .env.local, functions/.env, service-account JSON keys, or sk_live_/whsec_ values.

## Part 1 — Service account + GitHub secret

1. Open [Google Cloud Console](https://console.cloud.google.com/) → project **`resumora-live`**.
2. **IAM & Admin → Service Accounts → Create service account**
   - Name: `github-actions-hosting`
   - ID: `github-actions-hosting`
3. Grant roles (Add another role for each):
   - **Firebase Authentication Admin** (`roles/firebaseauth.admin`) — optional for Auth admin tasks; Hosting deploy mainly needs Hosting Admin
   - **Firebase Hosting Admin** (`roles/firebasehosting.admin`) — required
   - **Cloud Run Viewer** (`roles/run.viewer`) — required for your audit/ops visibility from CI if needed
   - **API Keys Viewer** (`roles/serviceusage.apiKeysViewer`) — as requested
   - Recommended extras for reliable Hosting deploys:
     - **Firebase Admin** (`roles/firebase.admin`) _or_ **Firebase Develop Admin** if Hosting-only role is insufficient in your org
     - **Service Account User** on the default compute SA if deploy fails with impersonation errors
4. Open the new SA → **Keys → Add key → Create new key → JSON** → download once.
5. GitHub repo **`ahmadlatifdev/bossmind-resumora`** → **Settings → Secrets and variables → Actions → New repository secret**
   - Name: **`FIREBASE_SERVICE_ACCOUNT`**
   - Value: paste the **entire** JSON file contents
6. Delete the downloaded JSON from your Downloads folder after pasting. **Never commit it.**

### Additional GitHub Secrets (Vite build — required because `.env.local` is gitignored)

Create repository secrets (or Environment **`production`** secrets) for each:

| Secret name                           | Purpose                                      |
| ------------------------------------- | -------------------------------------------- |
| `VITE_FIREBASE_API_KEY`               | Firebase web API key (public client key)     |
| `VITE_FIREBASE_AUTH_DOMAIN`           | e.g. `resumora-live.firebaseapp.com`         |
| `VITE_FIREBASE_PROJECT_ID`            | `resumora-live`                              |
| `VITE_FIREBASE_STORAGE_BUCKET`        | Storage bucket                               |
| `VITE_FIREBASE_MESSAGING_SENDER_ID`   | Messaging sender id                          |
| `VITE_FIREBASE_APP_ID`                | Firebase app id                              |
| `VITE_FIREBASE_MEASUREMENT_ID`        | GA / Firebase measurement (`G-…`)            |
| `VITE_GA_MEASUREMENT_ID`              | Optional explicit GA4 id                     |
| `VITE_STRIPE_PUBLISHABLE_KEY`         | `pk_live_…` / `pk_test_…` (publishable only) |
| `VITE_STRIPE_PRICE_BASIC`             | Price id (if used at build time)             |
| `VITE_STRIPE_PRICE_BALANCED`          | Price id                                     |
| `VITE_STRIPE_PRICE_PROFESSIONAL_TIER` | Price id                                     |
| `VITE_STRIPE_PRICE_ADVANCED`          | Price id                                     |
| `VITE_PAYWALL_ALLOW_AUTHED`           | Usually empty / `false` in production        |

**Do not** put `sk_live_`, `whsec_`, or `RESEND_API_KEY` in GitHub Actions Hosting workflows — those belong in Cloud Functions / Secret Manager only.

---

## Part 1b — Production Approval Gate (required)

`deploy-prod.yml` splits into:

1. **`build`** — checkout, `npm ci`, Vite build, upload `dist` artifact (no environment)
2. **`deploy`** — waits for GitHub Environment **`production`**, then deploys the artifact to Hosting `live`

Configure the gate once:

1. GitHub repo → **Settings → Environments → New environment**
2. Name: **`production`**
3. **Deployment branches**: restrict to `main` (and optionally `workflow_dispatch` from `main`)
4. Enable **Required reviewers** → add yourself (and any other approvers)
5. Optional: **Wait timer** (e.g. 5 minutes) for a cool-down before deploy
6. Move prod-only secrets (especially `FIREBASE_SERVICE_ACCOUNT`) onto this Environment if you want repository secrets unused by prod deploy

Until **Required reviewers** is enabled, `environment: production` alone does **not** pause the job. After it is enabled, pushes to `main` will show **Review deployments** in Actions; Approve to publish to https://resumora.net.

Rejecting the review cancels the live deploy; the build artifact is discarded after retention (3 days).

---

## Part 2 — Optional Firebase CLI helper

You can run (interactive):

```powershell
cd D:\BossMind\bossmind-resumora
firebase login
firebase init hosting:github
```

That wizard can create similar workflows and set `FIREBASE_SERVICE_ACCOUNT` for you.

**If you already use the workflows in this repo**, skip the wizard (or decline overwriting) to avoid duplicate YAML.

---

## Part 3 — Workflows (already in repo)

- Preview: `.github/workflows/deploy-preview.yml` — `pull_request` → `main` (ungated)
- Production: `.github/workflows/deploy-prod.yml` — `push` → `main` (+ manual `workflow_dispatch`)
  - `environment.name: production`
  - `environment.url: https://resumora.net`
- Both use `projectId: resumora-live` and secret `FIREBASE_SERVICE_ACCOUNT`
- Production uses `channelId: live` (serves `client-resumora-live` / resumora.net per `firebase.json`)

---

## Push commands

From your working branch (merge to `main` when ready):

```powershell
cd D:\BossMind\bossmind-resumora
git checkout -b chore/ci-firebase-hosting
git add .github/workflows/deploy-preview.yml .github/workflows/deploy-prod.yml docs/CI_CD_FIREBASE_HOSTING.md .gitignore
git status
git commit -m "ci: add Firebase Hosting preview and production GitHub Actions"
git push -u origin HEAD
```

Then open a PR into `main`. After merge (or push to `main`), confirm under **Actions** that **Deploy Firebase Hosting Production** reaches the **Review deployments** gate before live Hosting updates.

To verify preview: open a PR and look for the Hosting preview URL comment from the Action.

---

## Security checklist

- [ ] `.env.local` / `functions/.env` remain gitignored
- [ ] No service-account JSON in git
- [ ] `FIREBASE_SERVICE_ACCOUNT` only in GitHub Secrets / Environment secrets
- [ ] No `sk_live_` / `whsec_` in Actions Hosting secrets
- [ ] GitHub Environment **`production`** exists with **Required reviewers** enabled
- [ ] Deployment branches for `production` limited to `main`
- [ ] Preview workflow remains ungated (PR-only)
