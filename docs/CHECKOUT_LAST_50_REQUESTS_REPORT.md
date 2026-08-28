# createCheckoutSession — Last 50 Log Entries Report

**Generated:** 2026-08-23 (UTC)  
**Project:** `resumora-live`  
**Service:** `createcheckoutsession` (`us-central1`)  
**Ready revision:** `createcheckoutsession-00017-muh`  
**Window:** `2026-08-23T12:31:05Z` → `2026-08-23T13:51:06Z`  
**Source:** `gcloud logging read` (Cloud Run revision logs, limit 50)

Secrets, `sk_*`, `whsec_*`, and `price_*` values are **not** included in this report.

---

## Executive summary

| Metric                  | Value                     |
| ----------------------- | ------------------------- |
| Log entries             | 50                        |
| HTTP requests           | 40                        |
| OPTIONS → 204           | 34                        |
| POST → 400              | 6                         |
| POST → 2xx              | 0                         |
| 403 / PERMISSION_DENIED | 0                         |
| Avg / p50 / max latency | 7.4 ms / 4.1 ms / 93.7 ms |

Runtime is healthy. Traffic in this window is probe/CORS traffic plus empty-body validation POSTs. No completed Stripe Checkout sessions appear. CLI invoker IAM warnings are **not** reflected as runtime deny responses.

---

## Status mix (HTTP)

- **204** — 34 (all `OPTIONS`)
- **400** — 6 (all `POST`, invalid/missing `planId`)

Severity across all 50: INFO 40 · WARNING 6 · NOTICE 4 (WARNINGs align with the 400 POSTs).

---

## POST detail

| UTC       | Status | Latency | URL (trimmed)                                         | Notes                                                   |
| --------- | ------ | ------- | ----------------------------------------------------- | ------------------------------------------------------- |
| 13:44:13Z | 400    | 3.6ms   | `…/createCheckoutSession/api/create-checkout-session` | Empty `{}` smoke; odd path (function + rewrite segment) |
| 13:44:13Z | 400    | 3.0ms   | Cloud Run service URL `/`                             | Empty `{}` smoke                                        |
| 13:44:13Z | 400    | 4.9ms   | `…/createCheckoutSession`                             | Empty `{}` smoke                                        |
| 12:37:47Z | 400    | 5.6ms   | `…/createCheckoutSession/api/create-checkout-session` | Empty `{}` smoke                                        |
| 12:37:47Z | 400    | 5.1ms   | `…/createCheckoutSession`                             | Empty `{}` smoke                                        |
| 12:37:06Z | 400    | 21.5ms  | `…/createCheckoutSession`                             | Empty `{}` smoke                                        |

Expected app error for missing plan: `Invalid planId. Expected one of: basic, balanced, professional, advanced`.

---

## Platform events (non-HTTP)

- **12:34Z** — `DEPLOYMENT_ROLLOUT` to revision **00017**; STARTUP TCP probe succeeded on port 8080.
- Autoscaling instance start after rollout.
- Periodic OPTIONS (~5 min) consistent with health/probe traffic.
- Revision mix in HTTP sample: **39** on `00017-muh`, **1** residual on `00016-xap`.

---

## Hosting / IAM

- Firebase Hosting rewrite: `/api/create-checkout-session` → function `createCheckoutSession` (`firebase.json`).
- Org policy blocks `allUsers` `roles/run.invoker`; public access uses `invoker-iam-disabled=true`.
- No 403s in this sample → Hosting + direct invoke working for app-level responses.

---

## Reusable request (next time)

```text
Analyze the last 50 Cloud Logging entries for Cloud Run service
createcheckoutsession in project resumora-live (us-central1). Summarize
HTTP method/status counts, latency (avg/p50/max), IAM/403 presence,
revision IDs, and whether Hosting rewrite traffic succeeded. Redact all
Stripe secrets and price IDs. Deliver a status mix chart plus a table of
every POST.
```

---

## Next verification

1. Trigger one real checkout from `/pricing` with a valid `planId`.
2. Re-run this report and confirm a 2xx (or Stripe redirect) POST appears.
3. Optionally include Firebase Hosting access logs for browser → `/api/create-checkout-session`.
