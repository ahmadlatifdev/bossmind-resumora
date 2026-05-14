# Render + Railway deployment strategy

BossMind locked topology:

- **Render**: frontend/public client interface
- **Railway**: backend APIs, workers, orchestration runtime
- **Neon**: shared memory/database authority

Vercel is not an approved deployment target for this repository.

## Environment variables (Railway)

| Variable | Purpose |
|----------|---------|
| `NODE_ENV` | `production` |
| `PORT` | Injected by Railway; `server.js` listens on `process.env.PORT` |
| `STRIPE_SECRET_KEY` | Stripe Checkout session creation (`pages/api/checkout.js`) |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Client-side Stripe.js where applicable |
| `NEON_DATABASE_URL` | Neon Postgres — shared memory, engagement, analytics |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | Optional Google Analytics (see `pages/_document.js`) |
| `NEXT_PUBLIC_GSC_VERIFICATION` | Optional Search Console HTML tag |
| `NEXT_PUBLIC_CLARITY_PROJECT_ID` | Optional Microsoft Clarity project id (public; see `pages/_document.js`) |
| `NEXT_PUBLIC_BING_SITE_VERIFICATION` | Optional Bing Webmaster HTML tag content (`msvalidate.01`) |
| `NEXT_PUBLIC_SOCIAL_*` | Optional footer social URLs (`LINKEDIN`, `X`, `YOUTUBE`, `INSTAGRAM`) |
| `SE_RANKING_API_KEY` | **Worker only** — SE Ranking API (never `NEXT_PUBLIC_*`; see `config/bossmind-seo-ai-visibility-stack.json`) |

## Frontend (Render)

Deploy frontend/client surfaces on Render. Keep public route and UX validation tied to protected baseline checks (`npm run bossmind:ui-baseline`, `npm run bossmind:ui-probe`).

## Backend/API (Railway)

Deploy backend APIs, orchestration, and worker processes on Railway (`npm run build` then `npm start` / `node server.js`).

## DNS

Point production domains according to the split topology:

- frontend hostnames to Render
- API/orchestration hostnames to Railway

Apply only after health checks, uploads, checkout, and webhook validation pass.

## Migration safety

When moving existing services, switch DNS and webhook targets gradually and keep rollback tags/snapshots available for protected baseline recovery.
