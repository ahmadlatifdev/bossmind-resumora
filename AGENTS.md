<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Deployment

Assume **production runs only on Railway** with Neon for Postgres. Do not add or preserve Render deployment configuration unless the user explicitly asks. See `docs/RAILWAY_DEPLOY.md`.

## Local preview (development)

`npm run dev` runs `scripts/dev-with-browser.mjs` (spawns `next dev` and opens the browser when ready; polls `/api/health` as a fallback). Use `npm run dev:plain` for `next dev` only. Do not ship client-visible debug preview chrome in production builds.
