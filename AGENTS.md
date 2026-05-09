<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Deployment

Assume **production runs only on Railway** with Neon for Postgres. Do not add or preserve Render deployment configuration unless the user explicitly asks. See `docs/RAILWAY_DEPLOY.md`.

## Local preview (development)

`npm run dev` runs `scripts/dev-with-browser.mjs` (opens the browser when Next is ready). The **Preview Manager** (`components/dev/PreviewManager.jsx`) mounts only in development and shows the live URL in fixed top/bottom chrome plus a floating **Open Live Preview** control. Import **`styles/dev-preview.css` only from `pages/_app.js`** (Next.js global CSS rule). Reuse it in other BossMind Next apps by copying `PreviewManager.jsx`, `dev-preview.css`, `lib/dev/preview-config.js`, and `pages/api/health.js`, then mirror the `_app.js` imports + dynamic import pattern.
