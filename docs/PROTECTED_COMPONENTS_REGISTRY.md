# Protected components & paths (Resumora)

**Surface lock:** Every approved `pages/**/*.js` route module is listed in `config/bossmind-protected-surface.json` (`surfaceLockPaths`). The Anti-Leak guard merges that list with this registry. **`npm run bossmind:protect:verify`** confirms none of those files were deleted. Intentional edits to locked paths require **`BOSSMIND_PROTECTED_EDIT_OK=1`** (see `scripts/bossmind-antileak-guard.mjs`).

Other BossMind products (ElegancyArt, AI Video Generator, TikTok AI, Global Stock, Master Admin) live in **other repositories** — replicate `config/bossmind-protected-surface.json` + registry pattern per repo; there is no remote cross-repo enforcement from Resumora alone.

Agents must **not** rewrite or remove these without explicit owner approval. Prefer **minimal diffs** and extend rather than replace.

## Core layout & navigation

| Area | Path(s) |
|------|---------|
| App shell / sidebar / topbar / footer | `components/marketing/SiteChrome.js` |
| Minimal shell (auth/legal flow) | `components/marketing/MinimalAppChrome.js` |
| Universal footer dock (social + engagement) | `components/marketing/FooterUniversalDock.jsx`, `FooterSocialStrip.jsx`, `FooterEngagementDock.jsx` |
| Language switch | `components/marketing/LanguageSwitcher.js`, `context/LanguageContext.js` |

## i18n & copy

| Area | Path(s) |
|------|---------|
| EN/FR marketing strings | `lib/marketing/site-copy.js`, `lib/marketing/legal-copy.js` |

## Monetization / Stripe

| Area | Path(s) |
|------|---------|
| Plan → Price ID mapping | `lib/marketing/stripe-plan-map.js` |
| Checkout session | `pages/api/checkout.js`, `lib/marketing/client-hooks.js` |
| Webhooks | `pages/api/webhooks/stripe.js` |
| Verify session | `pages/api/verify-session.js` |
| Service quote + checkout metadata bridge | `lib/marketing/service-quote-pricing.js` |

## Shared memory / orchestration / safety

| Area | Path(s) |
|------|---------|
| Neon schema init + events | `lib/shared/neon-memory.js` |
| Preservation / rolling backup | `docs/BOSSMIND_PRESERVATION_AND_BACKUP.md`, `config/bossmind-preservation-scope.json`, `scripts/bossmind-backup-daily.mjs` |
| File guard / rollback snapshots | `lib/shared/file-guard.js`, `pages/api/orchestration/file-guard.js` |
| LangGraph repair | `lib/orchestration/langgraph-repair-flow.js` |
| Sentry ingest / repair triggers | `pages/api/orchestration/sentry-ingest.js`, `next.config.ts` |

## Immutable production baseline (luxury UI freeze)

| Area | Path(s) |
|------|---------|
| Sealed checksums + policy | `config/bossmind-immutable-production-baseline.json` |
| On-disk restore snapshots | `config/bossmind-baseline-snapshots/luxury-v1/**` |
| Shared fingerprint logic | `lib/orchestration/bossmind-baseline-fingerprint.js`, `lib/orchestration/bossmind-immutable-baseline.js` |
| Verify (deploy gate) | `scripts/bossmind-immutable-verify.mjs` — `npm run bossmind:immutable:verify` |
| Seal after approved UI change | `npm run bossmind:baseline:seal` |

**Rules:** Deploy gate runs immutable verify (skip with `BOSSMIND_DEPLOY_GATE_SKIP_IMMUTABLE=1` only for emergencies). Explicit approval to ship drift: `BOSSMIND_BASELINE_OVERRIDE=1` then re-seal. Optional live check: `BOSSMIND_IMMUTABLE_PROBE_ORIGIN=https://resumora.net` or `BOSSMIND_IMMUTABLE_PROBE_FROM_LOCK=1`. Strict full-repo checksum: set `lockFullWorkspaceFingerprint: true` in the baseline JSON and re-seal.

## Marketing home & tiers

| Area | Path(s) |
|------|---------|
| Protected luxury baseline manifest (single active UI authority) | `config/bossmind-protected-ui-authority.json`, `lib/orchestration/bossmind-interface-authority.js` |
| Homepage | `components/marketing/HomePage.jsx`, `pages/index.js` |
| Capabilities/services grid & configurator | `components/marketing/sections/ServiceOfferingsGrid.jsx` |
| Pricing UI | `components/marketing/sections/PricingPanel.jsx` |

## Styling tokens

| Area | Path(s) |
|------|---------|
| Luxury design tokens | `styles/resumora-global.css` |

## Policies (routes)

| Page | Path |
|------|------|
| Privacy | `pages/privacy.js` |
| Terms | `pages/terms.js` |
| Refund | `pages/refund.js` |
| About / Contact / Support / Chat | `pages/about.js`, `contact.js`, `support.js`, `chat.js` |

---

**Process:** For changes touching ≥2 protected areas, run `npm run bossmind:checkpoint` first and keep PRs small.

## Task completion enforcement (scripts)

| Script | Path |
|--------|------|
| Task completion gate (lint + build + immutable + optional live probe) | `scripts/bossmind-task-completion-gate.mjs` → `npm run bossmind:completion:gate` |
| Forbidden public UI regression scan | `scripts/bossmind-public-ui-forbidden-scan.mjs` → `npm run bossmind:forbidden-ui:scan` |
| Policy | `docs/BOSSMIND_TASK_COMPLETION_GATE.md` |
