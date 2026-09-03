# Hermes Agent — BossMind / Resumora integration

**Live:** https://resumora.net  
**Rule:** Cloud Functions never spawn the local `hermes` CLI. They call `HERMES_API_URL` with a bearer from Secret Manager.

Windows install path is `%LOCALAPPDATA%\hermes` (same layout as Linux `~/.hermes`).

## Part 1 — Install (Windows native)

In a new PowerShell window:

```powershell
irm https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.ps1 | iex
```

Close and reopen the terminal so `hermes` is on PATH. Docs: https://hermes-agent.nousresearch.com/docs/user-guide/windows-native

WSL2 alternative (if you prefer Linux paths): follow the Linux installer inside WSL, then set `HERMES_HOME` to `~/.hermes`.

## Path mapping (no secret values)

| Purpose           | Windows                             | Linux / WSL             |
| ----------------- | ----------------------------------- | ----------------------- |
| Home              | `%LOCALAPPDATA%\hermes`             | `~/.hermes`             |
| Secrets           | `%LOCALAPPDATA%\hermes\.env`        | `~/.hermes/.env`        |
| Non-secret config | `%LOCALAPPDATA%\hermes\config.yaml` | `~/.hermes/config.yaml` |
| Skills            | `%LOCALAPPDATA%\hermes\skills\`     | `~/.hermes/skills\`     |

Copy skill templates from `docs/hermes/skills/` into the Hermes `skills` folder.

Pull GCP secrets into the local `.env` (does not print values):

```powershell
cd D:\BossMind\bossmind-resumora
powershell -ExecutionPolicy Bypass -File .\scripts\setup-hermes-local.ps1
```

Create secrets first (you paste values locally; do not put them in git):

```powershell
gcloud secrets create HERMES_API_KEY --project=resumora-live
gcloud secrets create HERMES_API_SERVER_KEY --project=resumora-live
# Then add versions with --data-file=- (never echo keys in chat)
```

Grant the Cloud Functions runtime SA `secretmanager.secretAccessor` on those IDs (`scripts/setup-deploy-iam.ps1` lists them).

## Setup models

Nous Portal (recommended for tools + models):

```powershell
hermes setup --portal
```

Or pick OpenRouter / Grok 4.3:

```powershell
hermes model
```

Enable persistent memory:

```powershell
hermes memory setup
```

Optional self-improve skill:

```powershell
hermes skills install hermes-dojo
```

Start the OpenAI-compatible API (localhost only):

```powershell
hermes gateway
```

Expect `http://127.0.0.1:8642`. Test without printing the bearer:

```powershell
# Replace the bearer from your local .env — do not paste it into chat
curl http://127.0.0.1:8642/v1/models -H "Authorization: Bearer <from-local-env>"
```

## Production (Cloud Run)

`HERMES_API_URL` must be a URL **Cloud Functions can reach** (not `127.0.0.1` on your laptop). Options:

1. Run Hermes gateway on a small VM / Cloud Run sidecar with TLS and a private ingress.
2. Point `HERMES_API_URL` at that HTTPS base (no trailing slash), e.g. `https://hermes.internal.example`.

Set on the `sendChatMessage` / admin Hermes functions (key **names** only):

- `HERMES_API_URL`
- `HERMES_API_SERVER_KEY` (or `API_SERVER_KEY`)
- `HERMES_CHAT_ENABLED` (`true`/`false`)

Until `HERMES_API_URL` is set, Client Chat stays on the policy FAQ catalog (or Gemini if Hermes is marked unreachable and `GEMINI_API_KEY` is attached).

## Performance optimization (local)

```powershell
cd D:\BossMind\bossmind-resumora
powershell -ExecutionPolicy Bypass -File .\scripts\optimize-hermes-local.ps1
```

This script:

1. Detects CUDA GPUs with ≥8GB VRAM (`nvidia-smi`). If present, adds Docker `--gpus=all` and larger tool/context limits. Otherwise uses CPU-safe limits (prefer Nous Portal / cloud models).
2. Writes `config.yaml`: streaming, compression, memory, delegation (`max_concurrent_children: 3`), API `max_concurrent_runs: 8`, 30s-oriented timeout env knobs.
3. Runs `hermes config check` and `hermes memory status` when the CLI is on PATH (or `%LOCALAPPDATA%\hermes\bin`).
4. Copies `Skills/` into `%LOCALAPPDATA%\hermes\skills\bossmind\`.

Interactive one-time setup (run in your own terminal):

```powershell
hermes memory setup
hermes skills install hermes-dojo
hermes gateway
```

Corrections: use the `Feedback-Corrections` skill / memory tool so lasting preferences land in `USER.md` / memories (never store secrets).

**Production note:** Local `hermes gateway` on `127.0.0.1:8642` is not reachable from Cloud Functions. Set a public/private HTTPS `HERMES_API_URL` on the Functions runtime and store `HERMES_API_SERVER_KEY` in Secret Manager before Client Chat will use Hermes in prod.

## Client Chat behavior

1. FAQ catalog answers simple billing/account matches.
2. Complex / fallback questions try Hermes when the admin toggle is on.
3. Dual-tier fallback:
   - Hermes **timeout / rate limit** → policy FAQ
   - Hermes **unreachable / not configured** → Gemini (`GEMINI_API_KEY`) → FAQ
4. Cloud client uses streaming aggregation, identical-prompt coalesce, and `HERMES_MAX_INFLIGHT` gating.
5. Recommended gateway timeout: `HERMES_API_TIMEOUT=30` / `HERMES_CHAT_TIMEOUT_MS=30000`.

## Master Admin

`/admin/master#agents` — status, latency, error rate, **Performance Metrics** (TTFT, cache hit rate, tool events, in-flight), chat toggle, insights.

## Skills (repo → Hermes skills dir)

Repo folder `Skills/`:

- `Resume-Deep-Analysis`
- `Stripe-Refund-Summary`
- `Dashboard-Status`
- `Feedback-Corrections`

Also see `docs/hermes/skills/` for earlier templates.
