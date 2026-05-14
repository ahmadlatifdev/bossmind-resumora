# Windows Snipping Tool — invisible selection overlay (ASUS / VivoBook)

**Symptoms:** Snipping Tool opens, captures save, but the **rectangle border / dim overlay** is invisible during selection (feels like “hidden fullscreen”).

**Scope:** This repo **cannot** fix GPU drivers, HDR, or DWM from Git. Use **`scripts/windows-snipping-overlay-diagnostics.ps1`** (read-only) plus the steps below.

## Quick isolation (5 minutes)

1. **HDR off (test):** **Settings → System → Display → HDR** — turn **off**, retry **Win+Shift+S** → Rectangle.  
2. **Single display:** Disconnect external monitor; retry on **internal panel only**.  
3. **Night Light / color filters:** **Settings → System → Display** — disable **Night light** temporarily.  
4. **Scaling:** **Settings → System → Display → Scale** — use **100%** or **125%** only for the test (revert after).  
5. **Snipping Tool repair:** **Settings → Apps → Installed apps → Snipping Tool → Advanced options → Repair** (then **Reset** only if Repair fails and you accept loss of app data for that app).

## GPU / overlay (ASUS + dual-GPU)

- **Intel + NVIDIA:** **Settings → System → Display → Graphics** — set **Snipping Tool** / **Screen Snipping** to **Power saving** (iGPU) or **High performance** (dGPU) and **test both**.  
- **Armoury Crate / GameVisual / overlays:** Temporarily **disable** ASUS overlay / “GPU mode” / screen filters; retest.  
- **Driver:** **Intel** and **NVIDIA/AMD** — install latest from **ASUS support page** + vendor (clean install optional).

## Windows UI / transparency / animations

- **Settings → Accessibility → Visual effects** — turn **Animation effects** **On** (overlay often depends on composition).  
- **Settings → Personalization → Colors** — **Transparency effects** **On** (diagnostic script can suggest HKCU value).  
- **Game Mode:** **Settings → Gaming → Game Mode** — try **Off** for testing.

## Full-screen optimization (legacy per-app)

- **Snipping Tool** → **Properties** (if you launch from `.exe` shortcut) → **Compatibility** → disable **“Disable full-screen optimizations”** / try toggling **Run as administrator** off — test; behavior varies by build.

## Keyboard / capture path

- Confirm **Win+Shift+S** is not remapped by **PowerToys Keyboard Manager**, **AutoHotkey**, **Armoury Crate**, or **Bitdefender** safe-pay overlays.

## After changes

- **Sign out** (or reboot) once HDR/GPU assignment changed.  
- Re-run: **`npm run bossmind:windows:snip-diagnostics`**

## Anti-leak / safety

- Do **not** paste registry exports with machine SID into public chats.  
- **Chrome profiles / bookmarks** are unrelated; Snip repair does not touch Chrome `User Data`.

## Repo script

| Command | Purpose |
|---------|---------|
| `npm run bossmind:windows:snip-diagnostics` | Read-only JSON report under `windows-heal/reports/` |
| Optional HKCU hint | `powershell ... -File scripts/windows-snipping-overlay-diagnostics.ps1 -ApplySafeUiHints` (sets transparency DWORD only) |
