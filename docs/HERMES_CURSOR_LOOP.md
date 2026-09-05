# Hermes + Cursor loop (ACK-gated)

**Repo:** `bossmind-resumora` only. Do **not** wire `bossmind-ecosystem` into Resumora deploy.

## Governance (non-negotiable)

| Allowed                                                  | Forbidden                                                     |
| -------------------------------------------------------- | ------------------------------------------------------------- |
| Hermes/Cursor propose tasks in Firestore `harness_tasks` | Cloud Functions executing arbitrary `commands` from Firestore |
| Admin **ACK** in Master Admin → Tasks                    | Auto-apply codeDiff on Cloud Run                              |
| Local Cursor / PowerShell apply after ACK                | Auto git push / firebase deploy from Functions                |
| Optional deploy via GitHub Actions with `task_id`        | `allUsers` invoker; secret printing                           |

BossMind mode remains **controlled self-healing**, not full production autonomy.

## Phase 1 — Hermes local (you run)

```powershell
hermes config set execute_code true
```

Only enables Hermes local file tools when **you** approve in Hermes. Cursor already has write access to `D:\BossMind\bossmind-resumora`. `bossmind-ecosystem` is out of scope for this loop.

## Firestore `harness_tasks`

Admin SDK only (client rules deny). Fields: `id`, `description`, `status` (`pending`→`acked`→`applied`→`deployed`/`failed`/`rejected`), `codeDiff`, `commands[]`, `actor`, `projectId`, `logs[]`, timestamps.

## APIs

| Method | Path                            | Auth                                            |
| ------ | ------------------------------- | ----------------------------------------------- |
| GET    | `/api/admin/tasks`              | `X-Admin-Password`                              |
| POST   | `/api/admin/tasks/create`       | admin                                           |
| POST   | `/api/admin/tasks/ack`          | admin (`ack` / `reject`)                        |
| POST   | `/api/admin/tasks/mark-applied` | admin (metadata only)                           |
| POST   | `/api/admin/tasks/automation`   | admin (`autoDeployAfterAck`)                    |
| POST   | `/api/webhooks/github`          | `X-Hub-Signature-256` + `GITHUB_WEBHOOK_SECRET` |

## GitHub webhook

1. Create secret `GITHUB_WEBHOOK_SECRET` in Secret Manager **and** GitHub Actions secrets (same value; paste locally, never in chat).
2. Mount / set on `githubdeploywebhook` Cloud Run (or redeploy Functions after env wiring).
3. Repo → Settings → Webhooks → Payload URL:

```text
https://resumora.net/api/webhooks/github
```

Content type `application/json`, secret = same value, events: `workflow_run` (and optionally `deployment_status`).

4. `deploy-prod.yml` accepts `workflow_dispatch` input `task_id` and notifies the webhook on success.

## Self-heal

When Resumora health score &lt; 80, creates at most one pending task per day (`health-low-YYYY-MM-DD`). Still requires **ACK**.

## Sample LOG_LEVEL loop

1. Master Admin → Tasks → **Create sample LOG_LEVEL task** (or Hermes creates equivalent).
2. Click **ACK**.
3. Locally (after reading the task commands):

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\apply-harness-task-local.ps1 -TaskId "<id>"
```

4. Mark applied in dashboard.
5. Deploy with task id (optional):

```powershell
gh workflow run deploy-prod.yml -f task_id="<id>"
```

6. Webhook / notify step sets status `deployed`.

## Toggle

Dashboard checkbox **Allow auto-deploy after ACK** only marks `autoDeployEligible`. It does **not** push to production by itself. You still run / merge CI.
