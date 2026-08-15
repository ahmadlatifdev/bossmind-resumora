# BossMind — Vercel & Cloudflare Deprecation

**Date:** 2026-08-14  
**Status:** Vercel and Cloudflare are **forbidden** as BossMind hosting/DNS platforms.

## Verified (active)
- `bossmind-resumora`: no `.vercel/`, `vercel.json`, `wrangler.toml`, `.cloudflare/`
- `VERCEL_*` env keys removed from active client
- Font Awesome no longer loaded from `cdnjs.cloudflare.com` (local `/css/icons.css`)
- `resumora.net` nameservers: **Google Cloud DNS** (`ns-cloud-b*.googledomains.com`) — not Cloudflare
- Hosting: Firebase `client-resumora-live`

## DNS
No registrar nameserver change required. Apex already uses Google Cloud DNS.

## Rule
Do not re-add Vercel CLI, Cloudflare Workers/Pages/Tunnels, wrangler, or `*.vercel.app` / Cloudflare nameservers to active BossMind projects.
