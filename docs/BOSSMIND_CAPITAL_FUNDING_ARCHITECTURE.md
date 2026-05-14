# BossMind Capital — protected funding architecture (policy)

This document defines the **governance model** for funding BossMind Capital from verified BossMind operating profits. It is **policy and architecture only**. It does **not** move money, execute trades, or activate dashboards from the **Resumora** repository.

**Activation** means: implement ingestion, approval workflows, and UI in the **BossMind Capital** app + finance ops (accounting, banking, compliance), with Neon tables under a dedicated **`project_key`** (see `config/bossmind-capital-funding-policy.json` for machine-readable constants).

---

## Synchronization status (this repo)

| Layer | Status |
|--------|--------|
| Written policy + JSON constants | **In-repo** (`docs/BOSSMIND_CAPITAL_FUNDING_ARCHITECTURE.md`, `config/bossmind-capital-funding-policy.json`) |
| Automated NET verification (Stripe + P&L + tax reserve) | **Not in Resumora** — requires finance system + Capital service |
| Transfer execution | **Human- or bank-gated** — never silent from a marketing app |
| Neon financial tables for Capital | **Capital migrations** — separate from Resumora `event_log` usage |
| Allocation dashboard | **Capital repo** when built |

---

## 1. Funding architecture (high level)

```
[Stripe + books per project] → NET verification job (monthly)
        → Ops safety floor + emergency reserve check (gates)
        → Approved surplus → allocation engine (cap = rate × NET)
        → Transfer preparation log (no auto-wire from app)
        → BossMind Capital funding ledger (Neon) + optional broker/custodian (Capital product)
```

- **Resumora (and siblings)** should emit **revenue signals** (e.g. Stripe webhooks already log to Neon `event_log` for Resumora) into a **future** consolidated `revenue_ingest` or finance warehouse; they must **not** be treated as full NET without booked expenses.
- **BossMind Capital** consumes **verified NET** rows and **policy gates**, then records **allocation intent** and **executed transfers** separately.

---

## 2. Verified NET monthly income (definition)

**NET** (per project, then optionally group roll-up) = **gross revenue** minus documented:

- Hosting  
- API / SaaS costs  
- Taxes reserve (accrued per policy)  
- Operational expenses (payroll, contractors, tools)  
- Refunds and chargebacks  
- Platform / payment fees (e.g. Stripe fees)  

Only **verified** rows (reconciled, signed-off in your accounting process) qualify for the allocation numerator. **Estimates and dashboards are not verification.**

---

## 3. Active allocation logic (recommended formula)

Let:

- `NET_v` = verified NET for the month (USD, ≥ 0)  
- `F_ops` = minimum operating liquidity required (hosting + API + critical runway)  
- `F_em` = emergency reserve target (policy-defined balance, not spent on allocation)  
- `r` = allocation rate of verified NET (**default 0.30** — see JSON config)

**Conservative allocation (capital preservation first):**

```
surplus = max(0, cash_available - F_ops - F_em)   # use books + bank, not NET alone
cap_from_net = r * NET_v
capital_allocation_usd = min(cap_from_net, surplus)
```

**Hard guards (must be code-enforced in Capital service, not prompts):**

- If **negative cash flow** or **unstable project state** (deploy failing, liquidity breach): **`capital_allocation_usd = 0`**.  
- If `NET_v` is missing or unaudited: **`capital_allocation_usd = 0`**.  
- **Rollback:** freeze allocation flag + restore last approved policy version (Git + config snapshot).

---

## 4. Protected financial rules (summary)

1. **Never** allocate from negative cash flow.  
2. **Never** allocate when operational safety or emergency reserve is below policy floor.  
3. **Never** exceed `r × NET_v` or `surplus`, whichever is lower.  
4. **Preserve** hosting/API reserves before any Capital transfer.  
5. **No high-risk or forced trades** — Capital deployment follows **Capital** product rules (ETF/dividend/low-risk bands); funding policy does not imply investment performance.  
6. **Audit trail:** every computed allocation append-only in Neon with actor, inputs hash, and approval id.

---

## 5. Automation readiness report

| Capability | Readiness | Owner |
|------------|-----------|--------|
| Stripe gross signal (Resumora) | **Partial** — webhooks / `verify-session` can feed events | Resumora + ops |
| Expense + tax + true NET | **External** — accounting / finance | Human + tools |
| Monthly NET verification job | **Not built here** | Capital + n8n/scheduler |
| Allocation calculation | **Policy defined**; implement in Capital | Capital repo |
| Transfer preparation logs | **Not built here** | Capital + finance |
| Allocation / funding dashboard | **Not built here** | Capital repo |
| Profit & compounding tracking | **Not built here** | Capital + broker statements |
| Risk monitoring | **Spec in** `BOSSMIND_CAPITAL_CORE_STACK.md` | Capital repo |
| Neon financial event tracking | **Schema TBD** in Capital DB | Capital migrations |
| Admin reporting across projects | **Master Admin / Capital** — not Resumora UI expansion | Per execution lock |

**Overall:** **Policy ~100%** in this commit; **operational automation ~0%** in Resumora by design.

---

## 6. Suggested Neon entities (Capital `project_key` only)

Illustrative names for **Capital** database (not Resumora’s default tables):

| Entity | Purpose |
|--------|---------|
| `funding_monthly_net` | Verified NET inputs per month / per source project |
| `funding_allocation_run` | Engine output: caps, surplus, proposed amount |
| `funding_transfer_intent` | Prepared transfer / internal journal — approval state |
| `funding_allocation_history` | Append-only history |
| `funding_reserve_snapshot` | Ops + emergency floor readings |

---

## 7. Dashboard fields (Capital UI — when built)

- Monthly verified NET (per project + consolidated)  
- Allocated capital amount (proposed vs executed)  
- Retained operating reserve vs floor  
- Cumulative BossMind Capital funding (ledger sum)  
- Portfolio funding history (post-transfer, from custodian data)  
- Risk exposure level (from Capital risk engine, not from funding policy alone)  
- Monthly compounding estimate (**illustrative** only, with disclosure)

---

## 8. Estimated capital growth scenarios (illustrative, not forecasts)

Examples use **funding only** (no market return); add returns only with explicit assumptions labeled **hypothetical**.

| Scenario | Assumption | Illustrative cumulative funding (12 mo) |
|----------|------------|-------------------------------------------|
| A | `NET_v = $10k` flat/month, `r = 0.30`, surplus always ≥ cap | `12 × 0.30 × 10k = $36k` into ledger |
| B | Same NET, 2 months blocked (unstable) | `$36k − $6k = $30k` |
| C | NET grows 5%/mo from $10k base, all months pass gates | Sum of `0.30 × NET_v(m)` — compute in spreadsheet |

**Not** investment advice; **not** a promise of returns. Market compounding is separate and belongs in Capital analytics with proper disclaimers.

---

## 9. Anti-risk policy (funding + product)

- **Sustainability** — allocation never compromises payroll/hosting.  
- **Preservation** — surplus-first, cap-second.  
- **Gradual growth** — fixed `r` until board/policy changes.  
- **Diversification** — deployment rules live in Capital investment policy, not in Resumora.  
- **AI-assisted monitoring** — alerts and summaries; **no** unsupervised wires.  
- **Controlled scaling** — increase `r` only after sustained verified profitability and counsel sign-off.

---

## References

- **Core stack:** `docs/BOSSMIND_CAPITAL_CORE_STACK.md`  
- **Brand / priority ladder:** `docs/BOSSMIND_CAPITAL_BRAND.md`  
- **Machine-readable rates & guards:** `config/bossmind-capital-funding-policy.json`
