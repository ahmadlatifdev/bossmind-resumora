# Hermes Idea Request Queue

Autonomous overnight idea/update processor for Resumora + Cursor/Hermes.

## What it does

1. **Ingest & triage** — loads CSV/JSON backlog, LLM+heuristic dedupe, priority scoring, DAG ordering
2. **RAG compression** — Pinecone (optional) + local file embeddings; MCP HTTP tool `compress_task_context`
3. **Orchestration** — LangGraph-style state machine with **Redis file locks**, Cursor agent (`@cursor/sdk` or dry-run), branch `feat/auto-issue-[ID]`, lint/test, atomic commit, PR
4. **Self-heal QA** — GitHub Action feeds failing logs back (max 3) then flags manual review
5. **HITL** — auth / payments / schema tasks pause at web dashboard `:8790`
6. **Nightly sweeper** — 02:00 cron + GHA; enqueues 20–30 atomic PRs; **never merges to `main`**

## Quick start

```bash
cd hermes-idea-queue
cp .env.example .env
npm install
npm run typecheck

# From repo root:
docker compose -f hermes-idea-queue/docker-compose.yml up --build
```

- HITL: http://127.0.0.1:8790 (token = `HITL_TOKEN`)
- MCP: http://127.0.0.1:8791/health

Manual sweep:

```bash
docker compose -f hermes-idea-queue/docker-compose.yml --profile manual-sweep run --rm nightly
```

## CLI

| Command               | Purpose                               |
| --------------------- | ------------------------------------- |
| `npm run ingest`      | Load backlog → triage → Redis         |
| `npm run sweep`       | Nightly enqueue (respects HITL + DAG) |
| `npm run worker`      | BullMQ workers                        |
| `npm run hitl`        | Review dashboard                      |
| `npm run mcp`         | RAG MCP server                        |
| `npm run self-heal`   | Requeue from CI failure logs          |
| `npm run dev` / `all` | Full stack locally                    |

## Safety (non-negotiable)

- No auto-merge to `main` / production
- No Firebase/manual production deploy from this system
- HITL required for auth, Stripe/payments, schema/DB, secrets
- `CURSOR_DRY_RUN=true` by default
- Secrets only via env / GitHub Actions secrets (never committed)

## Env secrets (names only)

`REDIS_URL`, `CURSOR_API_KEY`, `HERMES_LLM_API_KEY`, `PINECONE_API_KEY`, `PINECONE_HOST`, `GITHUB_TOKEN`, `HITL_TOKEN`, `IDEA_QUEUE_REDIS_URL`

## Sample backlog

- `data/sample-backlog.json`
- `data/sample-backlog.csv`

Edit those (or point `BACKLOG_PATH`) to feed real ideas.
