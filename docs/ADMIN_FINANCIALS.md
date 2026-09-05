# Master Admin Financials

English-only Master Admin (`/admin/master`) financial ledger and 10% stock allocation.

## APIs

| Method | Path                             | Function                |
| ------ | -------------------------------- | ----------------------- |
| GET    | `/api/admin/financials`          | `getAdminFinancials`    |
| POST   | `/api/admin/financials/allocate` | `runFinanceAllocation`  |
| Cron   | `15 7 * * *` America/Toronto     | `financeAllocationCron` |

Auth: same admin password header as Master Dashboard (`X-Admin-Password`).

## Firestore

Collection: `financials`

Typical fields:

- `projectId` — `resumora` \| `elegancyart` \| `ai-video` \| `tiktok-ai` \| `global-stock`
- `type` — `revenue` \| `cost` \| `tax`
- `category` — e.g. `subscriptions`, `hosting`, `stripe_fees`, `stock_allocation_out`, `stock_allocation_in`
- `amountCents` — integer USD cents
- `currency` — `USD`
- `monthKey` — `YYYY-MM`
- `description` — short English note (no secrets)
- `source` — `seed` \| `dashboard_sync` \| `stock_allocation` \| manual

Settings doc: `admin_settings/finance`

- `taxRatePct` (default from env `FINANCE_TAX_RATE_PCT`, else 20)
- `stockAllocationPct` (default from env `FINANCE_STOCK_ALLOCATION_PCT`, else 10)
- `allocationEnabled` — set `false` to disable auto-allocation (rollback)

Idempotency lock: `financials/allocation-lock-YYYY-MM-DD`

## Env (Cloud Run / Functions — key names only)

- `FINANCE_TAX_RATE_PCT`
- `FINANCE_STOCK_ALLOCATION_PCT`

## Dummy project test (after deploy)

1. In Firestore Console, add a revenue row (example):

```json
{
  "projectId": "elegancyart",
  "type": "revenue",
  "category": "subscriptions",
  "amountCents": 100000,
  "currency": "USD",
  "monthKey": "2026-09",
  "description": "Dummy test revenue",
  "source": "manual_test"
}
```

2. Optional cost row with `type: "cost"`, `amountCents: 20000`, `category: "hosting"`.
3. Open `https://resumora.net/admin/master#financials` → **Refresh financials**.
4. Click **Run today's 10% stock allocation** once.
5. Confirm:
   - ElegancyArt shows cost category `stock_allocation_out`
   - Global Stock Trade shows revenue `stock_allocation_in`
   - Second click same day returns skipped / “already ran”
6. Cleanup: delete the dummy docs and today’s `allocation-lock-*` / `alloc-out-*` / `alloc-in-*` docs if this was a dry run.

## Rollback

1. Set `admin_settings/finance.allocationEnabled` to `false`, **or**
2. Set Cloud Run env `FINANCE_STOCK_ALLOCATION_PCT=0` on allocation functions and redeploy via GitHub Actions.
3. Cron still runs but records a disabled lock for the day; no transfers.
4. Reverse a mistaken day by deleting that day’s `alloc-out-*` / `alloc-in-*` / `allocation-lock-*` docs (never print payment secrets while doing so).

## Notes

- Catalog projects start sparse until real ledger rows exist; Resumora may show a synced 30d revenue hint from Master Dashboard analytics.
- Client site EN/FR/ES is unchanged; only admin UI is locked to English.
- Do not log Stripe charge IDs, customer PII, or secret values in `description`.
