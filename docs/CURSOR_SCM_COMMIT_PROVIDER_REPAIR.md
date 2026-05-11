# Cursor: “No full commit provider registered” — repair playbook

This document is **safe for production repositories**: it does not rewrite Git history, delete `.git`, or run destructive Git commands. It restores **Cursor’s built-in Git (vscode.git)** as the full Source Control commit provider and stabilizes the commit/push workflow.

## Detect (symptoms)

- Source Control shows **no commit box**, empty providers, or errors mentioning **commit provider**.
- **Git Output** may show extension activation failures or missing `git`.
- Terminal `git` may still work — that indicates **IDE integration**, not your repo, is broken.

## Diagnose (ordered)

| # | Area | What to check |
|---|------|----------------|
| 1 | Built-in Git | Cursor → Extensions → **Show Built-in Extensions** → **Git** → must be **Enabled**. |
| 2 | User settings | `%APPDATA%\Cursor\User\settings.json` → `git.enabled` must not be `false`. Optional explicit `git.path`. |
| 3 | Workspace root | **File → Open Folder** on the folder that contains `.git` (or the monorepo root Git recognizes). |
| 4 | Git on disk | `where.exe git` and `git --version` in PowerShell. |
| 5 | Git Output | Command Palette → **Git: Show Git Output** — read first errors after reload. |
| 6 | Extension host | If Remote/SSH/WSL: Git must run in the **same** environment as the opened folder. |
| 7 | Conflicts | Temporarily disable **GitLens** (and other SCM extensions), **Reload Window**, retest. |
| 8 | Corrupted UI cache | See **Repair (workspace cache)** below — forum reports for similar SCM registration failures. |

Community references (similar SCM registration issues):

- [No source control providers — workspaceStorage recovery](https://forum.cursor.com/t/no-source-control-providers-registered-after-restart-resolved-by-deleting-workspacestorage/158919/14)
- [Cursor Tab / console showing commit provider message](https://forum.cursor.com/t/subject-cursor-ai-auto-completion-cursor-tab-not-working-no-full-commit-provider-registered-error-in-console/86585)

## Repair

### A. Re-enable built-in Git (most common)

1. `Ctrl+Shift+X` → **Built-in** (or “Show Built-in Extensions”).
2. Find **Git** (`vscode.git`) → **Enable** (workspace + globally if offered).
3. Command Palette → **Developer: Reload Window**.

### B. Exact User settings (merge; adjust path)

File: `%APPDATA%\Cursor\User\settings.json`

```json
{
  "git.enabled": true,
  "git.path": "C:\\Program Files\\Git\\cmd\\git.exe",
  "git.autoRepositoryDetection": true,
  "git.terminalAuthentication": true
}
```

Use **your** resolved path from `where.exe git` if it differs. Prefer `...\Git\cmd\git.exe` on Windows for consistent behavior with GUI apps.

### C. Workspace policy (this repo)

This repository includes `.vscode/settings.json` with:

- `git.enabled`: true  
- `git.autoRepositoryDetection`: true  

So opening **this workspace** will not accidentally disable Git via workspace settings.

### D. Workspace SCM cache (only if A–C failed)

1. **Fully quit Cursor** (all windows).
2. Optionally backup: `%APPDATA%\Cursor\User\workspaceStorage`.
3. Remove or rename **only** the subfolder for the broken workspace (not the whole tree without backup).  
   Heuristic: sort folders by **modified time** after opening the project once — the newest often corresponds to the current workspace state.

Or run the repo script with `-ResetWorkspaceScmCache` **after** closing Cursor (see script header — it renames the newest folder as a backup).

### E. Git installation / PATH

- Install [Git for Windows](https://git-scm.com/download/win) if `where.exe git` is empty.
- Restart Cursor after changing PATH.

## Validate

1. **Developer: Reload Window**
2. Open **Source Control** — you should see changes and a **commit message** input.
3. **Git: Show Git Output** — no fatal “cannot run git” errors.
4. Stage a file → Commit → **Push** (or terminal `git push`) to confirm end-to-end.

## Protect (prevent recurrence)

- Avoid disabling **built-in Git** when toggling extensions.
- Pin a correct **`git.path`** on machines where multiple Git installs exist.
- After Cursor upgrades, if SCM breaks once: **Reload Window** first; only then consider workspace cache rename (never delete `.git`).
- Keep using **Open Folder** at the repository root for single-repo workflows.

## Automation in this repo

From the repository root:

```bash
npm run cursor:scm-diagnose
```

Or PowerShell directly:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\cursor-git-scm-diagnostics.ps1
```

Optional (read script warnings first — close Cursor before reset):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\cursor-git-scm-diagnostics.ps1 -ResetWorkspaceScmCache -WhatIf
```

Exit codes: `0` clean, `1` warnings, `2` critical (e.g. `git.enabled: false` detected in readable settings).
