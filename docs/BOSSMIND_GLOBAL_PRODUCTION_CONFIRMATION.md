# BossMind global marketing + production confirmation

## One command (evidence JSON)

```bash
npm run bossmind:global:production-confirm
```

**Strict production gate** (Stripe financial pipeline must be ready):

```bash
BOSSMIND_CONFIRM_STRICT=1 npm run bossmind:global:production-confirm
```

**Optional:** also run the organic orchestrator (writes `.bossmind/campaigns` + Neon when configured):

```bash
BOSSMIND_CONFIRM_RUN_ORGANIC=1 npm run bossmind:global:production-confirm
```

## What this actually confirms

| Area | Mechanism |
|------|-----------|
| Hosting policy | `bossmind-hosting-guard.mjs` |
| Stripe readiness | `bossmind-stripe-production-report.mjs` |
| Critical automation files | `bossmind-enterprise-coverage-report.mjs` |
| Enterprise envelope phases (dry) | `bossmind-enterprise-envelope.mjs --dry-run` |
| SEO surfaces in repo | Presence of `seo-config.js`, `sitemap.xml.js`, `robots.txt.js`, public engagement API |
| Neon reachable | `initializeSharedMemory()` snapshot |

## What it cannot confirm without you

See the `cannotAutoConfirmFromRepo` array in the JSON output: GSC verification, social platform publishing, real-money charges, worldwide probes, YouTube/GBP assets, etc.

Those require **dashboard configuration**, **secrets on Render/Railway**, and **live smoke tests**.

## Related docs

- `docs/STRIPE_PRODUCTION_VALIDATION.md`
- `docs/BOSSMIND_GOOGLE_ORGANIC_GROWTH_ARCHITECTURE.md`
- `docs/BOSSMIND_ENTERPRISE_COVERAGE_MATRIX.md`
