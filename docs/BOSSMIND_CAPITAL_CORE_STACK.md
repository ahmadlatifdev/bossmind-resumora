# BossMind Capital — Final Core Stack (architecture contract)

This document is the **institutional architecture contract** for the **BossMind Capital** product. It is **not** implemented or activated inside the **Resumora** repository. Resumora remains the career-marketing app; Capital must live in **`BOSSMIND_REPO_ROOT_BOSSMIND_CAPITAL`** with its own deploy, secrets, Neon `project_key`, and legal review.

**Nothing in this file turns on external APIs** by itself. “Activation” means: implement, credential, and operate these layers **in the Capital codebase and infrastructure**, under human governance.

---

## Primary system rule

**Protect First. Grow Gradually.**

### Mandatory priority order

1. Survival  
2. Stability  
3. Capital preservation  
4. Gradual compounding  
5. Intelligent automation  
6. Global expansion  
7. Advanced optimization **only** after long-term stability is confirmed  

### Final mandatory rule

Never prioritize aggressive profit over **capital protection** and **system stability**. Any automation that moves risk or capital must be **policy-bounded**, **auditable**, and **kill-switchable** outside of LLM prose.

---

## Final core stack (platforms → roles)

| Layer | Platform | Intended role in BossMind Capital | Typical secrets / config (Capital repo only) |
|-------|-----------|-----------------------------------|-----------------------------------------------|
| **Charts & market UX** | [TradingView](https://www.tradingview.com) | Embedded institutional charts, watchlists, macro overlays — **read-mostly** presentation; licensing per TradingView terms. | TradingView widget / partner keys as required by their product. |
| **Strategic reasoning** | [OpenAI](https://platform.openai.com) | Summaries, macro interpretation, **validation** of structured inputs, narrative risk explanations — **not** sole authority for orders. | `OPENAI_API_KEY`, model policy, rate limits, PII redaction. |
| **Execution / repair / orchestration** | [DeepSeek](https://www.deepseek.com) | Operational AI for **internal** automation (deploy analysis, log triage, runbooks) only if policy allows; **never** unsupervised trading. | DeepSeek API keys; explicit allowlists of actions. |
| **Market data** | [Polygon.io](https://polygon.io) | Normalized equities/ETFs/indicators feeds for dashboards — **data licensing** and retention policy required. | `POLYGON_API_KEY` (or vendor-specific), usage tiers. |
| **Runtime monitoring** | [Sentry](https://sentry.io) | Errors, performance, release health for Capital services (Resumora already uses Sentry separately). | DSN per environment; alert routing. |
| **Workflow automation** | [n8n](https://n8n.io) | Alert routing, scheduled reports, **human-in-the-loop** escalations — not silent money movement. | n8n auth, webhook HMAC, IP allowlists. |
| **Immutable source** | [GitHub](https://github.com) | Version of record, protected branches, required checks, signed releases. | Branch protections, environments, required reviewers. |
| **Shared memory** | [Neon](https://neon.tech) | Append-heavy logs, task state, decision audit — **separate** `project_key` for Capital vs Resumora. | `NEON_DATABASE_URL` scoped to Capital DB or schema + RLS. |

---

## Suggested Neon memory model (implement in Capital migrations)

Use **`project_key = 'bossmind-capital'`** (or equivalent) so Resumora rows never mix with Capital. Example **logical** tables (names illustrative; migrate explicitly in Capital):

| Table / store | Purpose |
|----------------|---------|
| `task_state` | Orchestration tasks / playbooks |
| `event_log` | Append-only audit |
| `ai_decision_logs` | Model outputs tied to request IDs, hashes, and human approval flags |
| `risk_memory` | Aggregated risk signals, caps, breaches |
| `crisis_memory` | Crisis windows, defensive mode activations, post-mortems |
| `portfolio_history` | Snapshots of positions **if** you have legal basis to store them |
| `deployment_state` / `automation_status` | CI/deploy/n8n correlation |

**Resumora’s** `lib/shared/neon-memory.js` must **not** be extended here with Capital-only tables without a deliberate split (separate service or schema).

---

## Documented operational chain (example — Capital CI / runbooks)

**Sentry alert → human or policy-approved automation → recovery steps → verification → Neon `event_log` save**

DeepSeek (or any model) should sit **inside** that chain only where **actions are explicitly allowed** (e.g., open ticket, scale read replicas), not as unchecked portfolio authority.

---

## AI safety architecture (behavioral requirements)

Capital implementations should enforce:

- **Capital protection AI** — hard limits (exposure caps, loss limits) in **code**, not prompts alone.  
- **Defensive allocation** — rule engine before any “recommendation” surface.  
- **Volatility / drawdown** — automatic **risk-off** modes that are deterministic and testable.  
- **Safe mode** — feature-flag + config, not only LLM tone.  

Crisis detection outputs should feed **alerts + defensive posture suggestions**; **automatic exposure reduction** for real money requires brokerage integration, legal sign-off, and kill-switches.

---

## Institutional dashboard UI (Capital repo)

Luxury dark navy, restrained gold, calm motion, responsive layout. Avoid meme/gambling visuals. Match **`docs/BOSSMIND_CAPITAL_BRAND.md`**.

---

## BossMind synchronization (cross-cutting)

In Capital, **mirror** Resumora-style discipline:

- Shared memory patterns (Neon)  
- Anti-leak / secret scanning in CI  
- Immutable UI baseline where a dashboard exists  
- Deploy gates + post-deploy verification  
- Closed-loop **recording** of checkpoints (not fake “task complete”)  

---

## Autonomous validation (pre-deploy)

Before Capital production deploys:

- Route/API checks  
- Schema migration dry-run where applicable  
- Contract tests for market-data adapters  
- Dashboard smoke (Playwright) **when** the UI exists  
- Block promote on failed checks  

---

## What Resumora does **not** do

This Resumora tree **does not** host Capital dashboards, Polygon feeds, TradingView embeds, n8n workers, or Capital Neon tables. Updates here are **documentation + ecosystem registry** only until the Capital application repository is implemented.

---

## References

- **Brand & tone:** `docs/BOSSMIND_CAPITAL_BRAND.md`  
- **Funding from verified NET (30% policy, gates, Neon sketch):** `docs/BOSSMIND_CAPITAL_FUNDING_ARCHITECTURE.md` · **`config/bossmind-capital-funding-policy.json`**  
- **Ecosystem registry:** `config/bossmind-organic-growth-registry.json`  
- **Preservation index entry:** `config/bossmind-preservation-scope.json`  
