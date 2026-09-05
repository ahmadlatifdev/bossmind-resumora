# Hermes / BossMind system inventory (resumora-live)

**Updated:** 2026-09-04  
**Scope:** Discovery from GCP project `resumora-live` + Resumora Functions harness.  
**Security:** Key **names** only — never secret values.

## Auth model (do not use allUsers)

Admin HTTP Functions require header `X-Admin-Password` matching Secret Manager `ADMIN_REFUND_PASSWORD`.  
Org policy historically **blocks** `roles/run.invoker` for `allUsers`. Production uses Firebase Hosting rewrites + Cloud Run `--no-invoker-iam-check` (CI). Do **not** run:

```text
gcloud run services add-iam-policy-binding … --member=allUsers --role=roles/run.invoker
```

Hermes Chat in Master Admin calls `POST /api/admin/hermes-command` → Function `postAdminHermesCommand` / Cloud Run `postadminhermescommand`.

## Cloud Run inventory (us-central1)

Health probes (GET root unless noted): **401** = up + admin gate; **405** = up + method mismatch (typical for POST-only); **403** = invoker / IAM blocked from anonymous.

| Service                                             | Purpose                  | Keys (names)                                                   | Probe         |
| --------------------------------------------------- | ------------------------ | -------------------------------------------------------------- | ------------- |
| getmasterdashboard                                  | Master Dashboard API     | ADMIN_REFUND_PASSWORD, GEMINI, STRIPE                          | 401           |
| getmasterprojects                                   | Project registry         | ADMIN_REFUND_PASSWORD                                          | 401           |
| getsystemhealth / runsystemhealth                   | System health / heal run | ADMIN_REFUND_PASSWORD                                          | 401 / POST    |
| postadminhermescommand                              | Hermes harness chat      | ADMIN_REFUND_PASSWORD, GEMINI, STRIPE _(needs HERMES_API_URL)_ | 405 GET       |
| gethermesstatus / sethermeschat / gethermesinsights | Hermes status / toggle   | ADMIN_REFUND_PASSWORD + Hermes env                             | 401           |
| sendchatmessage                                     | Client chat              | GEMINI / Hermes                                                | 405 GET       |
| createcheckoutsession                               | Stripe Checkout          | STRIPE_*                                                       | 405 GET       |
| stripewebhook                                       | Stripe webhooks          | STRIPE_WEBHOOK_SECRET                                          | 405 GET       |
| deepseekproxy                                       | DeepSeek proxy           | DEEPSEEK_API_KEY                                               | 405 GET       |
| videogenerationagent / heygen* / localize* / video* | Video pipeline           | VEO / LOCALIZER / BILIBILI                                     | varies        |
| requestrefund / listrefund* / decide*               | Refunds                  | STRIPE, ADMIN                                                  | varies        |
| recovery-system                                     | Recovery                 | —                                                              | 403 anonymous |
| ssrclientresumoralive                               | SSR                      | —                                                              | hosting       |

Full list: `gcloud run services list --project=resumora-live --region=us-central1`

## Secret Manager (present)

ADMIN_REFUND_PASSWORD, BILIBILI_*, DEEPSEEK_API_KEY, GEMINI_API_KEY, LOCALIZER_SHARED_SECRET, RESEND_API_KEY, RESEND_FROM, STRIPE_API_KEY, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, VEO_SERVICE_ACCOUNT_KEY

## Missing / not mounted (add locally — do not paste into chat)

| Key / config                               | Where to add                                                                                                                 | Why                                                                    |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| HERMES_API_URL                             | Cloud Run env on `postadminhermescommand`, `sendchatmessage`, `gethermesstatus` (via Functions deploy / Secret or plain URL) | Live Hermes gateway — **currently absent** on `postadminhermescommand` |
| HERMES_API_SERVER_KEY or API_SERVER_KEY    | Secret Manager + defineSecret                                                                                                | Bearer for Hermes gateway                                              |
| HERMES_API_KEY                             | Secret Manager (model provider)                                                                                              | Local / portal Hermes                                                  |
| OPENAI_API_KEY                             | Secret Manager (optional)                                                                                                    | OpenAI tools                                                           |
| ELEVENLABS_API_KEY                         | Secret Manager (optional)                                                                                                    | TTS                                                                    |
| ALPHA_VANTAGE_KEY                          | Secret Manager (optional)                                                                                                    | Live stock quotes                                                      |
| SELF_HEAL_ADMIN_EMAIL / ADMIN_NOTIFY_EMAIL | Functions env                                                                                                                | Admin OTP email (Resend already present)                               |

Add secrets (interactive, no echo):

```powershell
# Example — paste value via stdin in your terminal only
gcloud secrets create HERMES_API_SERVER_KEY --project=resumora-live --replication-policy=automatic
gcloud secrets versions add HERMES_API_SERVER_KEY --project=resumora-live --data-file=-
```

Then redeploy Functions via GitHub Actions so mounts refresh.

## Firestore collections (code-referenced)

| Collection                | Role                                           |
| ------------------------- | ---------------------------------------------- |
| projects                  | BossMind harness registry (5 catalog projects) |
| users                     | Auth / Stripe customer links                   |
| refund_requests / Refunds | Refunds                                        |
| videos / user_downloads   | Video library                                  |
| ServiceEvents / Plans     | Service delivery                               |
| RevenueAnalytics          | Analytics                                      |
| security_alerts           | Self-heal                                      |
| media_publish_jobs        | Publish pipeline                               |
| bilibili_publish_log      | Bilibili                                       |
| admin_settings/gate       | Admin password override hash (OTP)             |

## Project catalog (isolation)

| projectId    | Status in registry | Live runtime in this GCP project |
| ------------ | ------------------ | -------------------------------- |
| resumora     | active             | Yes (resumora.net)               |
| elegancyart  | paused             | No — catalog only                |
| ai-video     | building           | Partial video Functions only     |
| tiktok-ai    | paused             | Catalog / shared video tools     |
| global-stock | paused             | Catalog only                     |

**Rule:** Resumora Functions must not silently write into other BossMind project databases or create Stripe products for ElegancyArt without explicit approval + that project’s API_URL.

## Registered harness skills (toolRouter)

| Skill id                 | Triggers                                                    |
| ------------------------ | ----------------------------------------------------------- |
| skill:project-health     | “health status of all projects”                             |
| skill:tool-inventory     | “What AI tools are available”                               |
| skill:resume-analysis    | Resume-Audit / CV                                           |
| skill:stock-risk-guard   | Stop-loss / risk guard                                      |
| skill:market-sentiment   | Global Stock / ticker (placeholder until ALPHA_VANTAGE_KEY) |
| skill:social-pipeline    | YouTube/TikTok pipeline                                     |
| skill:ecommerce-sync     | Inventory / ElegancyArt (blocks cross-project create)       |
| skill:video-script-gen   | Video scripts                                               |
| hermes → gemini fallback | Default when Hermes URL missing                             |

## Manual next steps

1. Stand up a **Cloud-reachable** Hermes gateway URL (not localhost). Local `hermes gateway` is typically `http://127.0.0.1:8642` and **cannot** be set as Cloud Run `HERMES_API_URL`.
2. Run (after you have a public/internal URL):

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\set-hermes-cloud-url.ps1 -ApiUrl "https://YOUR-HERMES-HOST"
```

3. Create `HERMES_API_SERVER_KEY` in Secret Manager; mount on Hermes Functions; redeploy via GitHub Actions.
4. ElegancyArt Checkout: set `ELEGANCYART_STRIPE_SECRET_KEY` (optional separate account) + `ELEGANCYART_STRIPE_PRICE_<PLAN>` env vars, then redeploy `createcheckoutsession`.
5. Optional: OPENAI / ElevenLabs / Alpha Vantage.
6. Test from Master Admin → Hermes Chat (admin password).

## ElegancyArt Checkout API (after env mapped)

```http
POST /api/create-checkout-session
Content-Type: application/json

{ "project": "elegancyart", "planId": "basic" }
```

Returns **503** until ElegancyArt price env vars exist. Resumora path unchanged (`project` omitted or `resumora`).
