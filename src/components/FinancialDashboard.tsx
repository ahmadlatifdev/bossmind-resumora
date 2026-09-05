import { mapAdminPlan, toAdminEnglish } from '../lib/adminEnglishLabels';
import { Link } from 'react-router-dom';

export type FinanceProjectRow = {
  projectId: string;
  name: string;
  revenueCents: number;
  costCents: number;
  taxCents: number;
  netProfitCents: number;
  costsByCategory?: Record<string, number>;
  allocatedToStockCents?: number;
  allocatedFromProjectsCents?: number;
  trend?: Array<{
    monthKey: string;
    revenueCents: number;
    costCents: number;
    taxCents: number;
    netProfitCents: number;
  }>;
};

export type FinancialDashboard = {
  generatedAt?: string;
  currency?: string;
  settings?: {
    taxRatePct?: number;
    stockAllocationPct?: number;
    allocationEnabled?: boolean;
  };
  projects?: FinanceProjectRow[];
  totals?: {
    revenueCents: number;
    costCents: number;
    taxCents: number;
    netProfitCents: number;
    allocatedToStockCents: number;
  };
};

function money(cents: number | null | undefined) {
  if (cents == null || Number.isNaN(Number(cents))) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(Number(cents) / 100);
}

function MiniTrend({ trend }: { trend?: FinanceProjectRow['trend'] }) {
  const series = trend || [];
  if (!series.length) return <p className="admin-master__lead">No trend yet.</p>;
  const max = Math.max(1, ...series.map((s) => Math.max(s.revenueCents, s.netProfitCents, 1)));
  return (
    <div className="admin-fin-trend" role="img" aria-label="Three-month revenue and profit">
      {series.map((row) => (
        <div key={row.monthKey} className="admin-fin-trend__col" title={row.monthKey}>
          <span
            className="admin-fin-trend__bar admin-fin-trend__bar--rev"
            style={{ height: `${Math.max(4, (row.revenueCents / max) * 100)}%` }}
          />
          <span
            className="admin-fin-trend__bar admin-fin-trend__bar--profit"
            style={{ height: `${Math.max(4, (Math.max(0, row.netProfitCents) / max) * 100)}%` }}
          />
          <span className="admin-fin-trend__label">{row.monthKey.slice(5)}</span>
        </div>
      ))}
    </div>
  );
}

type Props = {
  data: FinancialDashboard | null;
  busy?: boolean;
  onRefresh?: () => void;
  onRunAllocation?: () => void;
};

export default function FinancialDashboardPanel({ data, busy, onRefresh, onRunAllocation }: Props) {
  const projects = data?.projects || [];
  const totals = data?.totals;
  const settings = data?.settings;

  return (
    <section id="financials" className="admin-master__card">
      <h2>Financials</h2>
      <p className="admin-master__lead">
        Revenue, costs, estimated tax ({settings?.taxRatePct ?? 20}%), and net profit per project.
        Auto-allocation: {settings?.stockAllocationPct ?? 10}% of positive net → Global Stock Trade
        {settings?.allocationEnabled === false ? ' (disabled)' : ''}.
      </p>
      <div className="admin-tasks-toolbar">
        <Link className="admin-master__btn" to="/admin/financials">
          Open full Financials page
        </Link>
        <button
          type="button"
          className="admin-master__btn admin-master__btn--ghost"
          disabled={busy}
          onClick={() => onRefresh?.()}
        >
          {busy ? 'Working…' : 'Refresh financials'}
        </button>
        <button
          type="button"
          className="admin-master__btn admin-master__btn--ghost"
          disabled={busy}
          onClick={() => onRunAllocation?.()}
        >
          Run today&apos;s 10% stock allocation
        </button>
      </div>

      {totals ? (
        <dl className="admin-hermes-metrics admin-fin-totals">
          <div>
            <dt>Total revenue</dt>
            <dd>{money(totals.revenueCents)}</dd>
          </div>
          <div>
            <dt>Total costs</dt>
            <dd>{money(totals.costCents)}</dd>
          </div>
          <div>
            <dt>Est. tax</dt>
            <dd>{money(totals.taxCents)}</dd>
          </div>
          <div>
            <dt>Net profit</dt>
            <dd>{money(totals.netProfitCents)}</dd>
          </div>
          <div>
            <dt>Allocated to Stock Trade</dt>
            <dd>{money(totals.allocatedToStockCents)}</dd>
          </div>
        </dl>
      ) : null}

      <div className="admin-fin-grid">
        {projects.map((p) => (
          <article key={p.projectId} className="admin-fin-card">
            <header>
              <h3>{toAdminEnglish(p.name)}</h3>
            </header>
            <dl>
              <div>
                <dt>Revenue</dt>
                <dd>{money(p.revenueCents)}</dd>
              </div>
              <div>
                <dt>Costs</dt>
                <dd>{money(p.costCents)}</dd>
              </div>
              <div>
                <dt>Tax</dt>
                <dd>{money(p.taxCents)}</dd>
              </div>
              <div>
                <dt>Net profit</dt>
                <dd>{money(p.netProfitCents)}</dd>
              </div>
              <div>
                <dt>Allocated to Stock Trade</dt>
                <dd>{money(p.allocatedToStockCents || 0)}</dd>
              </div>
            </dl>
            {p.costsByCategory && Object.keys(p.costsByCategory).length ? (
              <ul className="admin-fin-cats">
                {Object.entries(p.costsByCategory).map(([cat, amt]) => (
                  <li key={cat}>
                    {mapAdminPlan(cat)}: {money(amt)}
                  </li>
                ))}
              </ul>
            ) : null}
            <MiniTrend trend={p.trend} />
          </article>
        ))}
      </div>
    </section>
  );
}
