# Windows + Chrome keyboard & productivity activation (production-safe playbook)

This document is an **operator checklist** for a stable laptop environment. **Nothing here runs automatically across the whole OS** from the Resumora repo; use the included **read-only** script plus manual steps in Windows and Chrome.

## 1. Keyboard system audit (repo-assisted)

Run (read-only by default):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/windows-keyboard-shortcut-diagnostics.ps1
```

- **Sticky / Filter / Toggle keys** — if shortcuts feel “stuck,” open **Settings → Accessibility → Keyboard** and verify Sticky Keys / Filter Keys / Slow Keys.  
- **Layout** — `Get-WinUserLanguageList` in the script; remove unused layouts that steal `Alt+Shift`.  
- **Remappers** — script lists **AutoHotkey, PowerToys, ASUS, Bitdefender**, etc. Disable temporarily to isolate conflicts.

Optional (only if you do **not** rely on those accessibility features):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/windows-keyboard-shortcut-diagnostics.ps1 -RepairAccessibilitySafe
```

Then **sign out or reboot** and retest.

## 2. Chrome shortcuts (manual validation)

In Chrome (each profile you care about), verify:

| Shortcut | Action |
|----------|--------|
| Ctrl+Shift+Delete | Clear browsing data |
| Ctrl+Shift+B | Toggle bookmarks bar |
| Ctrl+Shift+O | Bookmark Manager |
| Ctrl+T / Ctrl+W / Ctrl+Tab | Tabs |
| Ctrl+Shift+N | Incognito |

If a shortcut fails: **chrome://extensions** (disable all → retest), **chrome://settings/shortcuts**, and **edge case: OS or security software** capturing keys before Chrome.

## 3. Multi-profile stability & bookmarks (no forced Gmail)

- Use **separate Chrome profiles** with **desktop shortcuts** from `chrome://settings/manageProfile` — do not merge personal and work Google accounts in one profile if that causes Gmail to hijack the session.  
- **Safe bookmark sync** (repo): `npm run bossmind:chrome:bookmark-consolidation` → import the generated **HTML** into the **master** profile only (see script output paths under `windows-heal/reports/`).  
- **Backup before import:** `npm run bossmind:chrome:bookmark-backup` (quit Chrome first).

## 4. Border-limit & DPI (OS + app — not enforceable from Git)

- **Windows:** **Settings → System → Display** — use a **single recommended scale** (100% / 125% / 150%) per display; avoid per-app random overrides unless needed.  
- **Multi-monitor:** **Settings → System → Display** — reorder monitors; disconnect ghost displays if menus appear off-screen.  
- **Chrome:** Menus are positioned by Chrome + OS; if clipped, reduce zoom (**Ctrl+0**), or reset **Settings → Appearance → Page zoom**.  
- **Taskbar:** avoid “auto-hide” during critical demos if overlap causes perceived clipping.

There is **no supported global API** from this repository to force every third-party window inside screen bounds.

## 5. Windows UI stabilization (manual)

- **Snap:** Settings → System → Multitasking — Snap windows.  
- **Explorer:** Restart with **Task Manager → Windows Explorer → Restart** if sluggish.  
- **Keyboard repeat delay:** Settings → Bluetooth & devices → Keyboard.

## 6. BossMind productivity layer (bookmarks + profiles, not Cursor DB)

- Pin **Railway**, **Gmail**, **resumora.net**, **DeepSeek**, **ChatGPT** as bookmarks or PWA shortcuts **per profile**.  
- **Cursor “favorite chats”** live in **Cursor’s app data**, not Chrome — restore via **Cursor chat history / favorites** in the IDE.

## 7. Anti-conflict & anti-leak

- Do **not** commit `.env`, tokens, or Chrome `Login Data`.  
- Use **`npm run bossmind:chrome:bookmark-backup`** before bulk bookmark imports.  
- Avoid running two “full sync” tools (Chrome sync + manual HTML import) in the same minute — risk of duplicates.

## 8. Validation checklist (operator sign-off)

- [ ] Modifier keys work in Notepad (baseline).  
- [ ] Chrome shortcuts work with extensions off, then re-enable.  
- [ ] Each profile opens correct default account / no unwanted Gmail redirect.  
- [ ] Bookmarks open expected URLs (Resumora, ElegancyArt, commgl, etc.).  
- [ ] No menu consistently off-screen at current DPI.  
- [ ] `windows-keyboard-shortcut-diagnostics.ps1` output saved for audit.

## 9. Performance (Chrome)

- **chrome://settings/performance** — Memory Saver / Energy Saver per policy.  
- Close unused profiles; use **Task Manager** to spot heavy extensions.

## One-shot safe validation (repo)

From repo root (PowerShell):

```powershell
npm run bossmind:laptop:safe-validate
```

Optional: pass through accessibility repair (HKCU only):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/bossmind-laptop-workspace-safe-validate.ps1 -RepairAccessibilitySafe
```

This **does not** implement global border-clamp, Gmail Workspace policy, or Cursor chat recovery — see scope boundary above.

## Related repo scripts

| Script / command | Purpose |
|------------------|---------|
| `scripts/windows-keyboard-shortcut-diagnostics.ps1` | Read-only keyboard / Chrome profile folder listing |
| `npm run bossmind:chrome:bookmark-consolidation` | Deduped bookmark HTML export |
| `npm run bossmind:chrome:bookmark-backup` | Copy `Bookmarks` files to `windows-heal/chrome-bookmark-backups/` |
| `npm run bossmind:laptop:safe-validate` | Bundle: diagnostics + audit + optional backup + report file |

## Honest scope boundary

**Full laptop “activation”** (every app, every popup boundary, every workspace) is **operator + OS vendor territory**. This repo supplies **diagnostics, bookmark safety tooling, and a repeatable playbook** — not a kernel-level or Chrome-internals patch.
