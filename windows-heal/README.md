# WindowsHeal AI Self-Healing Toolkit

Production-safe Windows stability automation for GPU/display flicker recovery and long-term health maintenance.

## Folder structure

```text
windows-heal/
  config/
    settings.json
  scripts/
    WindowsHeal.Core.ps1
    WindowsHeal.Runner.ps1
    WindowsHeal.Orchestrator.ps1
    WindowsHeal.Screenshot.Core.ps1
    WindowsHeal.Screenshot.Runner.ps1
    WindowsHeal.Screenshot.Install.ps1
    WindowsHeal.Install.ps1
    WindowsHeal.SafeDriverRecovery.ps1
  logs/
    healing-log.jsonl            (created at runtime)
  reports/
    dashboard.html               (created at runtime)
  state/
    (reserved for future snapshots)
```

## What it implements

- **Detect -> Diagnose -> Repair -> Verify -> Log -> Protect** flow.
- GPU/display instability detection from Event Viewer (`Display`, `nvlddmkm`, `amdkmdag`, `igfx`, explorer faults, Kernel-PnP display churn).
- Explorer loop repair.
- Display stack reset (PnP restart path).
- Service auto-repair for selected critical desktop services.
- Predictive warnings (GPU timeout trend, handshake churn, CPU/disk pressure, low disk space).
- Driver audit (display driver version/signature snapshot).
- DISM/SFC integrity repairs (Repair mode).
- Safe optimization (temp cleanup + balanced power tuning).
- Driver safety runbook with **DDU integration path** and vendor-specific installer slots.
- Restore point creation before major fixes.
- State snapshots before/after repair in `state/`.
- Optional escalation hooks (Sentry/LangGraph/Cursor instruction artifact).
- Scheduled autonomous monitoring/healing tasks.
- JSONL logs + HTML dashboard + stability score.

## Dependencies

- Windows 10/11 with PowerShell 5.1+.
- Admin rights for repair/scheduled-task/restore-point actions.
- Optional:
  - DDU installed and path configured in `config/settings.json`.
  - Vendor WHQL installer path configured in `config/settings.json`.

## Install and run

1. Open **PowerShell as Administrator**.
2. Install tasks:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ".\windows-heal\scripts\WindowsHeal.Install.ps1" -RunNow
```

3. Manual modes:

```powershell
# Detect only
powershell -NoProfile -ExecutionPolicy Bypass -File ".\windows-heal\scripts\WindowsHeal.Runner.ps1" -Mode Detect

# Full repair (includes DISM + SFC)
powershell -NoProfile -ExecutionPolicy Bypass -File ".\windows-heal\scripts\WindowsHeal.Runner.ps1" -Mode Repair

# Automated healing pass
powershell -NoProfile -ExecutionPolicy Bypass -File ".\windows-heal\scripts\WindowsHeal.Runner.ps1" -Mode AutoHeal

# Orchestrated monitor/repair wrapper
powershell -NoProfile -ExecutionPolicy Bypass -File ".\windows-heal\scripts\WindowsHeal.Orchestrator.ps1" -Mode Monitor
```

## Scheduled automation

- `WindowsHeal-Monitor`: every 5 minutes (`Detect`)
- `WindowsHeal-AutoHeal`: every 20 minutes (`AutoHeal`)
- `WindowsHeal-RepairOnDisplayTDR`: every 30 minutes (`Repair`)

### Screenshot subsystem

Handles instability for:
- `PrtSc`, `Shift + PrtSc`, `Win + Shift + S`
- Snipping Tool / Screen Sketch glitches
- clipboard integration failures
- overlay frame/transparent render conflicts
- GPU/display conflicts affecting capture pipeline

Run manually:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ".\windows-heal\scripts\WindowsHeal.Screenshot.Runner.ps1" -Mode Diagnose
powershell -NoProfile -ExecutionPolicy Bypass -File ".\windows-heal\scripts\WindowsHeal.Screenshot.Runner.ps1" -Mode AutoHeal
```

Install screenshot monitoring tasks (Admin shell):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ".\windows-heal\scripts\WindowsHeal.Screenshot.Install.ps1" -RunNow
```

## Dashboard and logs

- Dashboard: `windows-heal/reports/dashboard.html`
- Event log stream: `windows-heal/logs/healing-log.jsonl`
- State snapshots + orchestrator outputs: `windows-heal/state/`

## Safety and rollback

- Restore point attempt before major repair actions.
- Driver rollback/restart guarded by thresholds.
- No unsafe registry cleaners, RAM boosters, overclocking, or aggressive tweaks.
- Driver clean reinstall remains runbook-controlled unless explicitly enabled.

## Advanced integration stack

Set in `config/settings.json`:

- `integration.sentryWebhookUrl`
- `integration.langGraphWebhookUrl`
- `integration.cursorInstructionPath`
- `integration.sendEscalations = true`

When enabled, post-repair incidents are exported to these hooks and to a local Cursor instruction JSON.

## DDU and clean reinstall workflow

Use:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ".\windows-heal\scripts\WindowsHeal.SafeDriverRecovery.ps1"
```

This launches the safe-mode runbook and optionally opens DDU/vendor installers if configured.
