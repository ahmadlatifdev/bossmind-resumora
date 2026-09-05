# System Master Backup — resumora-live

Portable, encrypted restore of **local secrets only** so a new Windows PC can run Resumora after cloning the git repo. This is not a substitute for GitHub + Firebase + Cloud Run; application source stays in git.

**Windows only.** Do not use these scripts on phones.

---

## What is backed up

The export script copies files **if they exist** (byte counts only; never contents):

| Relative path                   | Purpose                                  |
| ------------------------------- | ---------------------------------------- |
| `.env.local`                    | Local Vite / app env                     |
| `.env`                          | Root env (if present)                    |
| `functions/.env`                | Functions env (if present)               |
| `functions/.env.local`          | Functions local env (if present)         |
| `bilibili_secrets.env`          | Bilibili session material                |
| `firebase-service-account.json` | Local Firebase/GCP JSON key (gitignored) |

Ciphertext default path: `%USERPROFILE%\Documents\BossMind\BossMind_Master_Backup.enc`

AES helpers live in `scripts/master-backup-crypto.ps1` (`Export-Crypto` / `Import-Crypto`, plus internal protect/unprotect). Export/import scripts prefer `scripts/lib/master-backup-crypto.ps1` when present, otherwise load the `scripts/` copy. On some Windows hosts, endpoint protection blocks creating `scripts\lib\master-backup-crypto.ps1` by name — the `scripts\` copy is the supported fallback.

---

## Why this is secure

- **AES-256-CBC** with a random IV per backup.
- Password stretched with **PBKDF2-SHA256** (200,000 iterations) and a random salt.
- Salt + IV stored in the `.enc` header only (not the password).
- Unencrypted `.zip` is deleted immediately after encryption (export) and after extract (import).
- Scripts **never print** passwords, `sk_live_`, `whsec_`, `pk_live_`, Stripe price IDs, `BILIBILI_SESSDATA`, or service-account JSON.

The `.enc` file is useless without the password. Treat both as production credentials.

---

## WARNING — never do this

- Do **not** commit `BossMind_Master_Backup.enc` or any of the secret files to Git.
- Do **not** upload the `.enc` file to public cloud (Drive/Dropbox shared links, public GCS, email).
- Do **not** paste the encryption password, JSON keys, or env values into chat, tickets, or screenshots.
- Do **not** store the password in the same folder as the `.enc` file.

`.gitignore` lists `BossMind_Master_Backup.enc`, `.env*`, `bilibili_secrets.env`, and `firebase-service-account.json`.

---

## How to store the backup

1. Keep `BossMind_Master_Backup.enc` on encrypted disk or a password manager **file attachment**.
2. Keep the AES password in a **password manager** (1Password, Bitwarden, etc.) as a separate item.
3. Optional: one printed copy of the password in a physical safe (not next to a USB of the `.enc` file).

---

## Export (current Windows PC)

From the repo root:

```powershell
cd D:\BossMind\bossmind-resumora
powershell -ExecutionPolicy Bypass -File .\scripts\export-master-backup.ps1
```

You will be prompted twice for a strong password (16+ characters, upper, lower, digit, symbol). Input is hidden.

Optional output path:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\export-master-backup.ps1 -OutputPath "$env:USERPROFILE\Documents\BossMind\BossMind_Master_Backup.enc"
```

---

## Restore on a new Windows PC

1. Install Git, Node.js 20+, Google Cloud SDK, Firebase CLI, GitHub CLI (`gh`).
2. Clone the repo (source only):

```powershell
git clone https://github.com/ahmadlatifdev/bossmind-resumora.git D:\BossMind\bossmind-resumora
cd D:\BossMind\bossmind-resumora
```

3. Copy `BossMind_Master_Backup.enc` onto the machine (USB / password-manager download — private).
4. Decrypt and restore secrets:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\import-master-backup.ps1
```

When prompted, type `YES` to overwrite an existing file. The import script confirms restored paths are gitignored (and appends `.gitignore` if needed).

5. **Post-import bootstrap** (interactive logins; no secret paste):

```powershell
gcloud auth login
firebase login
gh auth login
npm ci
powershell -ExecutionPolicy Bypass -File .\scripts\setup-workload-identity.ps1 -SetGitHubSecrets
powershell -ExecutionPolicy Bypass -File .\scripts\setup-deploy-iam.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\bootstrap-secrets.ps1
npm run build
```

6. Health checks (names/status only — never log secret values):

```powershell
# Local UI/build
npm run build

# Optional: Stripe/Bilibili via existing healers (length/presence checks, not values)
powershell -ExecutionPolicy Bypass -File .\scripts\bootstrap-secrets.ps1
```

7. Production remains **git push → GitHub Actions → production environment approval**. Do not run `firebase deploy` or `gcloud run deploy` locally.

---

## Related

- [DEPLOYMENT_MASTER_GUIDE.md](./DEPLOYMENT_MASTER_GUIDE.md) — CI/CD and zero manual deploy
- `scripts/setup-workload-identity.ps1` — GitHub OIDC
- `scripts/setup-deploy-iam.ps1` — Cloud Run / Secret Manager IAM
- `scripts/bootstrap-secrets.ps1` — GitHub secret length/presence heal
