# BossMind Capital — brand & positioning (cross-repo)

This document defines how **BossMind Capital** is named and positioned across the BossMind ecosystem. The **live product UI** (dashboard, market panels, execution) belongs in the **BossMind Capital repository**, not in Resumora. Resumora only registers the product in `config/bossmind-organic-growth-registry.json` and preservation scope.

## Primary identity

| Element | Value |
|--------|--------|
| **Product name** | BossMind Capital |
| **Primary message** | *Protect First. Grow Gradually.* |
| **Role** | Institutional-grade **AI wealth intelligence** — not a consumer hype or meme-trading surface |

## Secondary positioning (approved language)

- Institutional AI investing (intelligence & risk framing, not unlicensed advice copy in UI)
- Stable global wealth intelligence
- Defensive AI capital management
- Sovereign-level **stability** strategy (discipline and process metaphor — not a claim of sovereign status)

## Tone & visual rules (for the Capital repo UI)

**Must feel:** premium, calm, intelligent, stable, professional, trustworthy.

**Must avoid:** neon “trading floor” palettes, meme aesthetics, casino metaphors, FOMO copy, aggressive profit-first messaging.

**Palette (guidance):** dark navy, deep graphite, restrained gold accents, optional silver highlights; institutional typography (serif + clean sans pairing).

## Strategy priority order (product philosophy)

1. Survival  
2. Stability  
3. Preservation  
4. Gradual growth  
5. Intelligent automation  
6. Expansion  
7. Advanced optimization **only** after long-term stability is demonstrated  

## BossMind platform integration (when Capital is built)

Reuse patterns from shared BossMind docs: Neon `task_state` / `event_log`, deploy gates, snapshots, anti-leak — **per Capital repo** with its own `BOSSMIND_PROJECT_KEY`. Do not overload Resumora’s production database with Capital-specific tables from this tree.

## Registry & environment (this monorepo)

- **Registry id:** `bossmind-capital` in `config/bossmind-organic-growth-registry.json`  
- **Clone root env:** `BOSSMIND_REPO_ROOT_BOSSMIND_CAPITAL`  
- **Legacy:** `BOSSMIND_REPO_ROOT_GLOBAL_STOCK` was the previous name; migrate CI and local env to `BOSSMIND_REPO_ROOT_BOSSMIND_CAPITAL`.

## Legal / safety

Any public UI that could be read as investment advice or order execution must carry **jurisdiction-appropriate disclosures** and be reviewed by qualified counsel. This markdown is **not** legal or investment advice.

## Architecture stack (integrations)

See **`docs/BOSSMIND_CAPITAL_CORE_STACK.md`** for the full **Final Core Stack** (TradingView, OpenAI, DeepSeek, Polygon, Sentry, n8n, GitHub, Neon) — implementation belongs in the **BossMind Capital** repository, not Resumora.

See **`docs/BOSSMIND_CAPITAL_FUNDING_ARCHITECTURE.md`** and **`config/bossmind-capital-funding-policy.json`** for the **protected 30%-of-verified-NET** funding model (policy + gates; no money movement from this repo).
