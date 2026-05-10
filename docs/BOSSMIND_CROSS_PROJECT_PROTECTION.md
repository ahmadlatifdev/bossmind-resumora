# Cross-project protection (honest scope)

## What this repository enforces (Resumora)

| Mechanism | Enforcement |
|-----------|----------------|
| **Route / API file deletion** | `npm run bossmind:protect:verify` — fails if a path in `config/bossmind-protected-surface.json` is missing. |
| **Edits to locked paths** | `npm run bossmind:antileak` — blocks diffs touching registry + `surfaceLockPaths` unless `BOSSMIND_PROTECTED_EDIT_OK=1`. |
| **Large CSS tear-outs** | Anti-Leak deletion threshold on `styles/resumora-global.css`. |
| **Merge conflict markers** | Anti-Leak fails build if `<<<<<<<` / `>>>>>>>` appear. |
| **Snapshots / rollback** | Scripts (`bossmind:snapshot`, `bossmind-restore-rollback`) + Neon when configured — **not** automatic on every deploy unless you wire CI. |

## What is **not** automatically enforced anywhere

- **Pixel-perfect visual regression** — not bundled (would need Percy/Chromatic or stored screenshots per release).
- **Blocking Railway/SSL deploys from this repo** — requires your hosting pipeline to call `npm run bossmind:validate` (or equivalent) and fail the deploy.
- **“Auto-rollback on bad deploy”** — not continuous; use Neon/git rollback scripts plus human or CI gate.
- **Other BossMind codebases** — **ElegancyArt**, **AI Video Generator**, **TikTok AI**, **Global Stock**, **BossMind Master Admin** must each copy:

  1. `config/bossmind-protected-surface.json` (adjusted file list),
  2. `docs/PROTECTED_COMPONENTS_REGISTRY.md`,
  3. Anti-Leak + surface verify wiring in `package.json`,
  4. CI step running `bossmind:validate` or `bossmind:protect:verify` + `bossmind:antileak`.

## AI safety

Cursor/Windsurf/Copilot do not read lockfiles automatically. Enforcement is **CLI + CI + policy** (`config/bossmind-orchestration-policy.json`, `.cursor/rules`). Approved layouts stay safe when validation runs **before merge**.
