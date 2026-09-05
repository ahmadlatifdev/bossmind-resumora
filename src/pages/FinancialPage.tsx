import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAdminAuth } from '../components/AdminAuthGate';
import { mapAdminPlan, toAdminEnglish } from '../lib/adminEnglishLabels';
import {
  exportFinanceCsv,
  fetchFinanceOverview,
  runFinanceAllocation,
  updateFinanceSettings,
  type FinanceOverview,
} from '../lib/adminApi';

function money(cents: number | null | undefined, currency: string, fx: Record<string, number>) {
  if (cents == null || Number.isNaN(Number(cents))) return '—';
  const rate = fx[currency] || 1;
  const value = (Number(cents) / 100) * rate;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function monthInputValue(mk?: string) {
  return mk || new Date().toISOString().slice(0, 7);
}

function LineChart({
  series,
  currency,
  fx,
}: {
  series: Array<{ monthKey: string; revenueCents: number; netProfitCents: number }>;
  currency: string;
  fx: Record<string, number>;
}) {
  if (!series.length) return <p className="admin-master__lead">No trend data available.</p>;
  const max = Math.max(
    1,
    ...series.map((s) => Math.max(s.revenueCents, Math.max(0, s.netProfitCents)))
  );
  const w = 560;
  const h = 180;
  const pad = 24;
  const step = series.length > 1 ? (w - pad * 2) / (series.length - 1) : 0;
  const toY = (v: number) => h - pad - (Math.max(0, v) / max) * (h - pad * 2);
  const revPath = series
    .map((s, i) => `${i === 0 ? 'M' : 'L'} ${pad + i * step} ${toY(s.revenueCents)}`)
    .join(' ');
  const profitPath = series
    .map((s, i) => `${i === 0 ? 'M' : 'L'} ${pad + i * step} ${toY(Math.max(0, s.netProfitCents))}`)
    .join(' ');
  return (
    <div className="admin-fin-chart-wrap">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="admin-fin-linechart"
        role="img"
        aria-label="Revenue and profit trend"
      >
        <path d={revPath} fill="none" stroke="#d4af37" strokeWidth="2.5" />
        <path d={profitPath} fill="none" stroke="#3dd68c" strokeWidth="2.5" />
        {series.map((s, i) => (
          <text
            key={s.monthKey}
            x={pad + i * step}
            y={h - 6}
            textAnchor="middle"
            fill="#9a8f6a"
            fontSize="10"
          >
            {s.monthKey.slice(5)}
          </text>
        ))}
      </svg>
      <p className="admin-fin-legend">
        <span className="admin-fin-legend__rev">Revenue</span>
        <span className="admin-fin-legend__profit">Net profit</span>
        <span>Peak {money(max, currency, fx)}</span>
      </p>
    </div>
  );
}

function PieChart({
  slices,
  currency,
  fx,
}: {
  slices: Array<{ category: string; amountCents: number }>;
  currency: string;
  fx: Record<string, number>;
}) {
  const total = slices.reduce((s, x) => s + x.amountCents, 0);
  if (!total) return <p className="admin-master__lead">No cost data available.</p>;
  const colors = ['#d4af37', '#3dd68c', '#6ea8fe', '#ff8fab', '#c4b5fd', '#94a3b8'];
  let angle = -90;
  const paths = slices.map((slice, i) => {
    const portion = slice.amountCents / total;
    const sweep = portion * 360;
    const start = angle;
    angle += sweep;
    const r = 54;
    const rad = (deg: number) => (deg * Math.PI) / 180;
    const x1 = 70 + r * Math.cos(rad(start));
    const y1 = 70 + r * Math.sin(rad(start));
    const x2 = 70 + r * Math.cos(rad(start + sweep));
    const y2 = 70 + r * Math.sin(rad(start + sweep));
    const large = sweep > 180 ? 1 : 0;
    return {
      d: `M 70 70 L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`,
      color: colors[i % colors.length],
      label: slice.category,
      amount: slice.amountCents,
    };
  });
  return (
    <div className="admin-fin-pie">
      <svg viewBox="0 0 140 140" width="140" height="140" role="img" aria-label="Cost distribution">
        {paths.map((p) => (
          <path key={p.label} d={p.d} fill={p.color} opacity="0.9" />
        ))}
      </svg>
      <ul>
        {paths.map((p) => (
          <li key={p.label}>
            <span style={{ background: p.color }} />
            {mapAdminPlan(p.label)} — {money(p.amount, currency, fx)}
          </li>
        ))}
      </ul>
    </div>
  );
}

function BarChart({
  series,
  currency,
  fx,
}: {
  series: Array<{ monthKey: string; allocatedCents: number }>;
  currency: string;
  fx: Record<string, number>;
}) {
  if (!series.length) return <p className="admin-master__lead">No allocation history yet.</p>;
  const max = Math.max(1, ...series.map((s) => s.allocatedCents));
  return (
    <div className="admin-fin-bars" role="img" aria-label="Allocation to stock trade">
      {series.map((s) => (
        <div
          key={s.monthKey}
          className="admin-fin-bars__col"
          title={money(s.allocatedCents, currency, fx)}
        >
          <span style={{ height: `${Math.max(4, (s.allocatedCents / max) * 100)}%` }} />
          <em>{s.monthKey.slice(5)}</em>
        </div>
      ))}
    </div>
  );
}

export default function FinancialPage() {
  const { password } = useAdminAuth();
  const [overview, setOverview] = useState<FinanceOverview | null>(null);
  const [fx, setFx] = useState<Record<string, number>>({ USD: 1, EUR: 0.92, GBP: 0.79, CAD: 1.36 });
  const [currency, setCurrency] = useState('USD');
  const [projectId, setProjectId] = useState('all');
  const [fromMonth, setFromMonth] = useState(() => {
    const d = new Date();
    d.setUTCMonth(d.getUTCMonth() - 5);
    return d.toISOString().slice(0, 7);
  });
  const [toMonth, setToMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [taxRate, setTaxRate] = useState(20);
  const [allocPct, setAllocPct] = useState(10);
  const [avgUnit, setAvgUnit] = useState(49);

  const load = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const out = await fetchFinanceOverview(password, { projectId, fromMonth, toMonth });
      setOverview(out.overview || null);
      if (out.fx) setFx(out.fx);
      if (out.overview?.settings) {
        setTaxRate(out.overview.settings.taxRatePct ?? 20);
        setAllocPct(out.overview.settings.stockAllocationPct ?? 10);
        setAvgUnit(Math.round((out.overview.settings.avgUnitRevenueCents || 4900) / 100));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load financials');
    } finally {
      setBusy(false);
    }
  }, [password, projectId, fromMonth, toMonth]);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = overview?.summary;
  const projects = overview?.projects || [];

  const projectOptions = useMemo(
    () => [
      { id: 'all', name: 'All projects' },
      { id: 'resumora', name: 'Resumora' },
      { id: 'elegancyart', name: 'ElegancyArt' },
      { id: 'ai-video', name: 'AI Video Generator' },
      { id: 'tiktok-ai', name: 'TikTok AI' },
      { id: 'global-stock', name: 'Global Stock Trade' },
    ],
    []
  );

  async function onAllocate() {
    if (
      !window.confirm(
        'Run today’s 10% stock allocation? Positive net only; idempotent for this day.'
      )
    ) {
      return;
    }
    setBusy(true);
    setError('');
    try {
      const out = await runFinanceAllocation(password);
      setNotice(
        out.skipped ? 'Allocation skipped (already ran today or disabled).' : 'Allocation recorded.'
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Allocation failed');
    } finally {
      setBusy(false);
    }
  }

  async function onExport() {
    setBusy(true);
    setError('');
    try {
      const csv = await exportFinanceCsv(password, { projectId, fromMonth, toMonth });
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bossmind-financials-${toMonth}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      setNotice('CSV exported.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setBusy(false);
    }
  }

  async function onSaveSettings() {
    setBusy(true);
    setError('');
    try {
      await updateFinanceSettings(password, {
        taxRatePct: taxRate,
        stockAllocationPct: allocPct,
        avgUnitRevenueCents: Math.round(avgUnit * 100),
      });
      setSettingsOpen(false);
      setNotice('Finance settings saved.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Settings save failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-dashboard admin-fin-page" aria-busy={busy}>
      <header className="admin-fin-page__hero">
        <div>
          <p className="admin-fin-page__eyebrow">BossMind command</p>
          <h2>Financials</h2>
          <p className="admin-master__lead">
            Consolidated revenue, costs, tax, net profit, and stock allocation across all projects.
          </p>
        </div>
        <div className="admin-actions">
          <Link className="admin-master__btn admin-master__btn--ghost" to="/admin/master">
            Overview
          </Link>
          <button
            type="button"
            className="admin-master__btn admin-master__btn--ghost"
            disabled={busy}
            onClick={() => void load()}
          >
            {busy ? 'Loading…' : 'Refresh'}
          </button>
          <button
            type="button"
            className="admin-master__btn admin-master__btn--ghost"
            disabled={busy}
            onClick={() => void onExport()}
          >
            Export CSV
          </button>
          <button
            type="button"
            className="admin-master__btn admin-master__btn--ghost"
            disabled={busy}
            onClick={() => setSettingsOpen(true)}
          >
            Settings
          </button>
          <button
            type="button"
            className="admin-master__btn"
            disabled={busy}
            onClick={() => void onAllocate()}
          >
            Run 10% allocation
          </button>
        </div>
      </header>

      {error ? (
        <p className="admin-master__alert" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="admin-master__ok" role="status">
          {notice}
        </p>
      ) : null}

      <section className="admin-master__card admin-fin-filters" aria-label="Financial filters">
        <label>
          <span>From</span>
          <input
            type="month"
            value={monthInputValue(fromMonth)}
            onChange={(e) => setFromMonth(e.target.value)}
          />
        </label>
        <label>
          <span>To</span>
          <input
            type="month"
            value={monthInputValue(toMonth)}
            onChange={(e) => setToMonth(e.target.value)}
          />
        </label>
        <label>
          <span>Project</span>
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            aria-label="Project filter"
          >
            {projectOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Currency</span>
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            aria-label="Currency"
          >
            {['USD', 'EUR', 'GBP', 'CAD'].map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="admin-fin-summary" aria-label="Summary">
        {[
          { label: 'Revenue (month)', value: summary?.month?.revenueCents },
          { label: 'Costs (month)', value: summary?.month?.costCents },
          { label: 'Tax (month)', value: summary?.month?.taxCents },
          { label: 'Net profit (month)', value: summary?.month?.netProfitCents },
          {
            label: 'Allocated to Stock (cum.)',
            value: summary?.allocatedToStockCents ?? summary?.cumulative?.allocatedToStockCents,
          },
        ].map((card) => (
          <article key={card.label} className="admin-master__card admin-fin-kpi">
            <h3>{card.label}</h3>
            <p>{money(card.value, currency, fx)}</p>
          </article>
        ))}
      </section>

      <section className="admin-fin-charts">
        <article className="admin-master__card">
          <h3>Revenue &amp; profit (6 months)</h3>
          <LineChart
            series={(overview?.trends?.revenueProfit || []).map((t) => ({
              monthKey: t.monthKey,
              revenueCents: t.revenueCents,
              netProfitCents: t.netProfitCents,
            }))}
            currency={currency}
            fx={fx}
          />
        </article>
        <article className="admin-master__card">
          <h3>Cost distribution</h3>
          <PieChart slices={overview?.costDistribution || []} currency={currency} fx={fx} />
        </article>
        <article className="admin-master__card">
          <h3>Allocation to Stock Trade</h3>
          <BarChart series={overview?.trends?.allocation || []} currency={currency} fx={fx} />
        </article>
      </section>

      <section className="admin-master__card">
        <h3>Per-project breakdown</h3>
        {!projects.length ? (
          <p className="admin-master__lead">No data available for this filter.</p>
        ) : (
          <div className="admin-fin-project-list">
            {projects.map((p) => {
              const open = expanded[p.projectId];
              return (
                <article key={p.projectId} className="admin-fin-project">
                  <button
                    type="button"
                    className="admin-fin-project__head"
                    aria-expanded={open}
                    onClick={() => setExpanded((s) => ({ ...s, [p.projectId]: !open }))}
                  >
                    <strong>{toAdminEnglish(p.name)}</strong>
                    <span>
                      Net {money(p.netProfitCents, currency, fx)} · Margin{' '}
                      {p.profitMarginPct == null ? '—' : `${p.profitMarginPct}%`} · MoM{' '}
                      {p.momGrowthPct == null ? '—' : `${p.momGrowthPct}%`}
                    </span>
                  </button>
                  {open ? (
                    <div className="admin-fin-project__body">
                      <dl>
                        <div>
                          <dt>Revenue (cum.)</dt>
                          <dd>
                            {money(p.cumulative?.revenueCents ?? p.revenueCents, currency, fx)}
                          </dd>
                        </div>
                        <div>
                          <dt>Costs</dt>
                          <dd>{money(p.cumulative?.costCents ?? p.costCents, currency, fx)}</dd>
                        </div>
                        <div>
                          <dt>Tax</dt>
                          <dd>{money(p.cumulative?.taxCents ?? p.taxCents, currency, fx)}</dd>
                        </div>
                        <div>
                          <dt>Month net</dt>
                          <dd>{money(p.monthly?.netProfitCents, currency, fx)}</dd>
                        </div>
                        <div>
                          <dt>Allocated out</dt>
                          <dd>{money(p.allocatedToStockCents || 0, currency, fx)}</dd>
                        </div>
                        <div>
                          <dt>Break-even units</dt>
                          <dd>{p.breakEvenUnits ?? '—'}</dd>
                        </div>
                      </dl>
                      {p.costsByCategory && Object.keys(p.costsByCategory).length ? (
                        <ul className="admin-fin-cats">
                          {Object.entries(p.costsByCategory).map(([cat, amt]) => (
                            <li key={cat}>
                              {mapAdminPlan(cat)}: {money(amt, currency, fx)}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="admin-master__lead">No cost categories yet.</p>
                      )}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="admin-fin-analytics">
        <article className="admin-master__card">
          <h3>P&amp;L (filtered)</h3>
          <table className="admin-fin-table">
            <thead>
              <tr>
                <th>Project</th>
                <th>Revenue</th>
                <th>Costs</th>
                <th>Tax</th>
                <th>Net</th>
              </tr>
            </thead>
            <tbody>
              {(overview?.pnl || []).map((row) => (
                <tr key={String(row.projectId)}>
                  <td>{String(row.name)}</td>
                  <td>{money(Number(row.revenueCents), currency, fx)}</td>
                  <td>{money(Number(row.costCents), currency, fx)}</td>
                  <td>{money(Number(row.taxCents), currency, fx)}</td>
                  <td>{money(Number(row.netProfitCents), currency, fx)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>
        <article className="admin-master__card">
          <h3>Tax by region (estimate)</h3>
          <ul className="admin-fin-cats">
            {Object.entries(overview?.analytics?.taxByRegion || {}).map(([region, row]) => (
              <li key={region}>
                {region} @ {row.ratePct}% → {money(row.estimatedTaxCents, currency, fx)}
              </li>
            ))}
          </ul>
          <p className="admin-master__lead">{overview?.analytics?.cashFlow?.note}</p>
          <p>
            Forecast next quarter revenue:{' '}
            <strong>
              {money(overview?.analytics?.forecast?.nextQuarterRevenueCents, currency, fx)}
            </strong>
          </p>
        </article>
      </section>

      <section className="admin-master__card">
        <h3>Allocation history</h3>
        {(overview?.allocationHistory || []).length ? (
          <table className="admin-fin-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Source</th>
                <th>Amount</th>
                <th>Destination</th>
              </tr>
            </thead>
            <tbody>
              {(overview?.allocationHistory || []).map((row) => (
                <tr key={row.id || `${row.date}-${row.sourceProjectId}`}>
                  <td>{row.date || '—'}</td>
                  <td>{row.sourceProjectName || row.sourceProjectId}</td>
                  <td>{money(row.amountCents, currency, fx)}</td>
                  <td>Global Stock Trade</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="admin-master__lead">No allocation transfers yet.</p>
        )}
      </section>

      {settingsOpen ? (
        <div
          className="admin-fin-modal"
          role="dialog"
          aria-modal="true"
          aria-label="Finance settings"
        >
          <div className="admin-fin-modal__panel admin-master__card">
            <h3>Finance settings</h3>
            <label>
              Tax rate %
              <input
                type="number"
                min={0}
                max={60}
                value={taxRate}
                onChange={(e) => setTaxRate(Number(e.target.value))}
              />
            </label>
            <label>
              Stock allocation %
              <input
                type="number"
                min={0}
                max={50}
                value={allocPct}
                onChange={(e) => setAllocPct(Number(e.target.value))}
              />
            </label>
            <label>
              Avg unit revenue (USD)
              <input
                type="number"
                min={1}
                value={avgUnit}
                onChange={(e) => setAvgUnit(Number(e.target.value))}
              />
            </label>
            <div className="admin-actions">
              <button
                type="button"
                className="admin-master__btn"
                disabled={busy}
                onClick={() => void onSaveSettings()}
              >
                Save
              </button>
              <button
                type="button"
                className="admin-master__btn admin-master__btn--ghost"
                onClick={() => setSettingsOpen(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
