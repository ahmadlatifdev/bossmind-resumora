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
| File guard / rollback snapshots | `lib/shared/file-guard.js`, `pages/api/orchestration/file-guard.js` |
| LangGraph repair | `lib/orchestration/langgraph-repair-flow.js` |
| Sentry ingest / repair triggers | `pages/api/orchestration/sentry-ingest.js`, `next.config.ts` |

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
