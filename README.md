BossMind / Resumora runtime with protected luxury UI baseline, orchestration APIs, and Neon-backed shared memory.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing route surfaces under `pages/` and protected UI modules under `components/marketing/`.

## Hosting strategy (locked)

- **Render** = frontend/public client interfaces
- **Railway** = backend APIs, workers, orchestration services
- **Neon** = shared memory + database authority
- **GitHub** = source control + deployment triggers
- **PowerShell** = local repair/runtime tooling

Vercel is not part of the approved runtime/deployment path unless explicitly reapproved.

## Deployment

See `docs/RAILWAY_DEPLOY.md` for Render (frontend) + Railway (backend) topology and environment setup.

Local preview: `npm run dev` → [http://localhost:3000](http://localhost:3000).
