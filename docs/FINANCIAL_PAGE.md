# BossMind Financial Page

Full-page Master Admin financial command center.

## Route

- **URL:** `/admin/financials`
- **Auth:** Same `X-Admin-Password` gate as Master Dashboard
- **Nav:** Sidebar **Financials** → full page (Master Overview keeps a summary + link)

## APIs

| Method | Path                                                  | Notes                                     |
| ------ | ----------------------------------------------------- | ----------------------------------------- |
| GET    | `/api/admin/financials/overview?projectId=&from=&to=` | Full overview JSON + FX rates             |
| GET    | `/api/admin/financials/trends?...`                    | Same handler (`view=overview`)            |
| GET    | `/api/admin/financials/export?...`                    | CSV download                              |
| POST   | `/api/admin/financials/allocate`                      | Idempotent 10% stock allocation           |
| POST   | `/api/admin/financials/settings`                      | Tax %, allocation %, avg unit revenue     |
| GET    | `/api/admin/financials`                               | Compact dashboard payload (Master teaser) |

Amounts are **USD cents** in Firestore; UI converts via Frankfurter (EUR/GBP/CAD) with 1h cache.

## Firestore

- `financials` — ledger (unchanged)
- `admin_settings/finance` — taxRatePct, stockAllocationPct, allocationEnabled, avgUnitRevenueCents, taxRegions, costCategories

## Phased delivery

| Phase | Scope                                                   | Est.  |
| ----- | ------------------------------------------------------- | ----- |
| 1     | Summary KPIs, project cards, SVG charts, allocation     | ~1.5h |
| 2     | Filters, FX, CSV export, settings modal                 | ~1h   |
| 3     | P&L table, tax-by-region, forecast, break-even, history | ~1h   |

No Recharts/Chart.js (not in deps) — SVG charts match NOIR LUXE admin chrome.

## Manual test

1. Unlock admin → open **Financials** in sidebar.
2. Confirm summary cards + charts render (empty states OK for catalog projects).
3. Change From/To/Project/Currency → data refreshes.
4. **Export CSV** downloads a file.
5. **Settings** → change tax % → Save → KPIs update.
6. **Run 10% allocation** (confirm) → history row or skip notice.
7. Master `#financials` teaser → **Open full Financials page**.

## Deploy

Merge via PR; GitHub Actions must deploy Hosting + `getAdminFinancials` + `updateAdminFinanceSettings` + `runFinanceAllocation`.
