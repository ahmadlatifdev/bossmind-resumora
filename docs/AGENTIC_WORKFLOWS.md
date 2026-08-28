# Agentic workflows + resume verification

## New APIs

| Path                                             | Function               | Role                                               |
| ------------------------------------------------ | ---------------------- | -------------------------------------------------- |
| `POST /api/resume/verify-parse`                  | `verifyResumeParse`    | Validate parse draft; write `failed_parses`        |
| `POST /api/video/agent-generate`                 | `videoGenerationAgent` | Plan → execute → verify → retry (max 3) → fallback |
| `POST /api/video/google-generate` + `agent:true` | `generateGoogleVideo`  | Same agent path for Studio Veo                     |

## Deploy functions (after `firebase login --reauth`)

```powershell
cd D:\BossMind\bossmind-resumora
firebase deploy --only functions:resumora-checkout:verifyResumeParse,functions:resumora-checkout:videoGenerationAgent,functions:resumora-checkout:generateGoogleVideo,functions:resumora-checkout:localizeVideo --project resumora-live

# Org policy often blocks allUsers invoker — apply:
foreach ($svc in @('verifyresumeparse','videogenerationagent','generategooglevideo','localizevideo')) {
  gcloud run services update $svc --project=resumora-live --region=us-central1 --no-invoker-iam-check --quiet
}
```

Do **not** use `gcloud run deploy … --source .` from the Vite repo root.

## Hosting

```powershell
cd D:\BossMind\bossmind-resumora
npm run build
firebase deploy --only hosting --project resumora-live
```
