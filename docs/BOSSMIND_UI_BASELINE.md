# Resumora luxury UI — protected baseline

## Single source of truth (BossMind “shared memory” = repo + tags)

There is **no separate Neon row** that defines the live UI. The **confirmed luxury baseline** is:

1. **`components/marketing/HomePage.jsx`** + **`pages/index.js`** (route `/`) — full hero, trust metrics, upload, pricing, EN/FR.
2. **Git tag** from `npm run bossmind:snapshot -- <label>` (rollback pointer; optional Neon event only logs the tag).

If localhost looks **minimal or pricing-only**, you are usually on the **wrong URL** or **stale `.next`**: see **Drift recovery** below.

## Route map (avoid confusing surfaces)

| URL | What it is |
|-----|------------|
| **`/`** | **Canonical luxury marketing homepage** (`HomePage.jsx`) — hero, strip, trust, upload, pricing. |
| **`/pricing`** | Pricing + trust + panel only (not the full homepage). |
| **`/client-engagement`** | Engagement lane (hero + `EngagementPanel`), **not** the full homepage. |
| **`/client`** | **Not** a page — redirects to **`/`** (see `next.config.ts`) to fix bad bookmarks. |

## Active production interface (canonical paths)

| Layer | Path |
|-------|------|
| Global tokens + frames | `styles/resumora-global.css` |
| Marketing shell | `components/marketing/SiteChrome.js` |
| Minimal shell (auth/legal) | `components/marketing/MinimalAppChrome.js` |
| **Luxury homepage composition** | **`components/marketing/HomePage.jsx`**, **`pages/index.js`** |
| Pricing cards + checkout UX | `components/marketing/sections/PricingPanel.jsx` |
| EN/FR | `context/LanguageContext.js`, `lib/marketing/site-copy.js` |
| Routes | `pages/**/*.js` (see `config/bossmind-protected-surface.json`) |

The interface is **single luxury dark navy + gold** (`:root` tokens). There is no separate “light mode” product skin; consistency means **same tokens** across routes.

## Workflow: Detect → Compare → Restore → Validate → Lock → Protect

1. **Detect:** `git status`, visual diff, `npm run bossmind:monitor` (with server up).
2. **Compare:** PR vs `origin/main`; large deletions in `styles/resumora-global.css` are guarded by `npm run bossmind:antileak`.
3. **Restore:** Minimal diffs only; follow `docs/BOSSMIND_SAFE_REVIEW_WORKFLOW.md` and `.cursor/rules/bossmind-resumora.mdc`.
4. **Validate:** `npm run bossmind:ui-baseline` (build + surface verify + anti-leak).
5. **Lock:** `npm run bossmind:snapshot -- <label>` (git tag + optional Neon event).
6. **Protect:** Edits to locked paths require `BOSSMIND_PROTECTED_EDIT_OK=1` for `bossmind:antileak` to pass when touching protected files.

## Drift recovery (stale UI on localhost)

1. **Confirm URL:** open **`http://127.0.0.1:3001/`** (not `/pricing` only). **`/client`** redirects to **`/`**.
2. **Confirm branch:** `git fetch` and `git status`; merge **`origin/main`** if behind.
3. **Clear Next cache (safe — does not touch `.git`):** `npm run clean:next`, then `npm run dev:plain`.
4. **Hard refresh** the browser (or disable cache in DevTools).
5. **Validate:** `npm run bossmind:ui-baseline`; with server up: `npm run bossmind:ui-probe` (homepage must include section anchors `top`, `trust`, `home-intake`, `pricing`).

## Commands

```bash
npm run clean:next                   # remove .next only; then restart dev server
npm run bossmind:dev-fresh         # clean:next + reminder to run dev:plain
npm run bossmind:ui-baseline       # production build + integrity + anti-leak
npm run bossmind:protect:verify    # files in bossmind-protected-surface.json exist
npm run bossmind:antileak          # blocked paths / destructive CSS guard
npm run bossmind:snapshot -- my-label # rollback tag at HEAD
```

Live HTML smoke (requires dev server, default `http://127.0.0.1:3001`):

```bash
npm run dev:plain
# other terminal:
npm run bossmind:ui-probe
```

## Tailwind / CSS stack

- **Primary styling:** hand-authored **`styles/resumora-global.css`** (`.rs-*` classes).
- **PostCSS:** `postcss.config.mjs` loads `@tailwindcss/postcss` for utility usage where present; **do not** replace the luxury shell with utility-only layouts.

## Deployment (production-safe)

Per `AGENTS.md` / `docs/RAILWAY_DEPLOY.md`: **Railway + Neon**. Run `npm run bossmind:ui-baseline` before merging UI-sensitive PRs.

## Honest limits

- **No pixel-perfect CI** in-repo (no Playwright screenshot baseline). Use manual preview + optional external visual regression tooling.
- **Hydration:** watch browser console on edited routes; `npm run build` catches many SSR issues but not all client-only mismatches.
