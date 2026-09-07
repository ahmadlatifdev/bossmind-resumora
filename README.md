# Resumora (bossmind-resumora)

Premium resume & cover letter platform — **https://resumora.net**

## Stack (Google-only)

- **Hosting:** Firebase Hosting (`client-resumora-live`)
- **API:** Firebase Functions gen2 → Cloud Run (`us-central1`)
- **Secrets:** GCP Secret Manager
- **AI:** Vertex AI / Gemini (optional `VERTEX_AI=true`)
- **Payments:** Stripe (keys in Secret Manager only)

Do not reintroduce Vercel, Netlify, Cloudflare Pages, Railway, or Render as hosting.

## Scripts

```bash
npm run build          # asserts no Vercel logos + Google-only stack, then Vite build
npm run gcp:scheduler  # dry-run Cloud Scheduler sync
npm run self-heal      # local self-heal test runner
```

## Performance audit

See [docs/PERFORMANCE_100_AUDIT.md](docs/PERFORMANCE_100_AUDIT.md) for the full-stack activation checklist (admin buttons, checkout routes, social metatags).

## Related docs

- [docs/GOOGLE_ONLY_STACK.md](docs/GOOGLE_ONLY_STACK.md)
- [docs/VERCEL_DEPRECATION.md](docs/VERCEL_DEPRECATION.md)
- [docs/DEPLOYMENT_MASTER_GUIDE.md](docs/DEPLOYMENT_MASTER_GUIDE.md)
