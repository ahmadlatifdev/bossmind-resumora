# Railway-only production deployment

This repository targets **Railway** as the sole managed hosting layer for the Next.js app (`npm run build` → `npm start` / `node server.js`). **Render is not used.** Do not add `render.yaml`, Render env blocks, or Render webhooks unless explicitly requested.

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
| `NEXT_PUBLIC_SOCIAL_*` | Optional footer social URLs (`LINKEDIN`, `X`, `YOUTUBE`, `INSTAGRAM`) |

## DNS

Point production domains (e.g. `resumora.net`) at Railway’s assigned hostname **after** validating health checks, uploads, checkout, and webhooks—never at legacy Render targets.

## Leaving Render (manual)

Pause/delete Render services only **after** Railway is live and DNS has propagated. Rotate any webhook endpoints or secrets that still referenced Render URLs.
