# BossMind SEO + AI visibility stack

This document describes the **in-repo** contract for the BossMind SEO + AI visibility expansion layer. It is **not** a substitute for logging into SE Ranking, Google Search Console, Bing Webmaster, or other dashboards.

## Truth boundary

| Capability | In this repo (Resumora) | External |
|------------|------------------------|----------|
| SE Ranking as primary SEO hub | **Policy + config** (`config/bossmind-seo-ai-visibility-stack.json`) | API keys, projects, rank tracking UI |
| GSC / GA4 / Clarity / Bing verification | **Public env + HTML** (`pages/_document.js`, `.env.example`) | Property verification, sitemap submit, data review |
| NeuronWriter / LowFruits | **Worker secret names only** | API keys in Railway; exports → human PRs |
| Multi-product (Capital, ElegancyArt, AI Video, Global Stock) | **Registry metadata** (`config/bossmind-organic-growth-registry.json`) | Sibling repos + their deploy envs |
| Full audit + score | **`npm run bossmind:seo:ai-visibility:audit`** | Live URLs + local env presence only |
| Lock state in Neon | **`npm run bossmind:seo:ai-visibility:lock`** | Operator confirms dashboards are done |

## Commands

```bash
npm run bossmind:seo:ai-visibility:audit
npm run bossmind:seo:ai-visibility:audit -- --json-out=windows-heal/reports/bossmind-seo-ai-visibility-audit.json
npm run bossmind:seo:ai-visibility:audit:persist
npm run bossmind:seo:ai-visibility:lock -- --i-understand-external-ops-manual --notes="Render env + GSC verified" --audit-json=windows-heal/reports/bossmind-seo-ai-visibility-audit.json
```

Optional: `--auto-fix-safe` appends missing **documentation lines** to `.env.example` (Clarity / Bing placeholders) if absent — it does **not** write secrets.

## Anti-leak

Never commit API keys or OAuth refresh tokens. Allowed **public** IDs live under `NEXT_PUBLIC_*` as listed in `config/bossmind-seo-ai-visibility-stack.json` → `antiLeak.publicEnvAllowed`. Everything else belongs in **Render / Railway / Secret Manager**.

## Duplicate analytics guard

Keep a **single** full gtag loader in `pages/_document.js`. The audit script flags multiple `googletagmanager.com/gtag/js` loads on the live homepage.

## References

- `config/bossmind-seo-ai-visibility-stack.json`  
- `lib/marketing/bossmind-seo-visibility-audit-lib.js`  
- `docs/GOOGLE_ORGANIC_AUTOMATION.md`  
- `docs/BOSSMIND_GOOGLE_ORGANIC_GROWTH_ARCHITECTURE.md`
