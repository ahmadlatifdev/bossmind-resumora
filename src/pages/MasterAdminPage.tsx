import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAdminAuth } from '../components/AdminAuthGate';
import {
  fetchMasterDashboard,
  adminHeaders,
  fetchHermesStatus,
  setHermesChatEnabled,
  fetchHermesInsights,
  fetchMasterProjects,
  type MasterProject,
} from '../lib/adminApi';
import AdminHermesCommandChat from '../components/AdminHermesCommandChat';
import { t, tFormat } from '../lib/i18n.js';

type ProjectCard = {
  id: string;
  name: string;
  status: string;
  revenueCentsMonthly: number | null;
  revenueCentsTotal: number | null;
  activeUsers: number | null;
  uptimeLabel: string | null;
  healthScore: number | null;
  live: boolean;
};

type SeriesPoint = { date: string; revenueCents: number; signups: number };

type FeedItem = {
  kind: string;
  id: string;
  title: string;
  status?: string;
  at?: string | null;
  score?: number;
};

type Dashboard = {
  generatedAt?: string;
  globalHealth?: { score?: number | null; status?: string; updatedAt?: string | null };
  projects?: ProjectCard[];
  analytics?: {
    series?: SeriesPoint[];
    revenueCents30d?: number;
    signups30d?: number;
    stripeConfigured?: boolean;
  };
  refunds?: { pending?: Array<Record<string, unknown>>; recent?: Array<Record<string, unknown>> };
  feed?: FeedItem[];
  criticalAlertCount?: number;
  pendingHealApprovals?: number;
  harness?: {
    averageHealth?: number | null;
    projects?: MasterProject[];
    generatedAt?: string;
  };
};

function money(cents: number | null | undefined, lang: string) {
  if (cents == null || Number.isNaN(Number(cents))) return t(lang, 'master.metricNa');
  return new Intl.NumberFormat(lang === 'fr' ? 'fr-CA' : lang === 'es' ? 'es' : 'en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(Number(cents) / 100);
}

function HealthGauge({ score, label }: { score: number | null | undefined; label: string }) {
  const n = Number(score);
  const ok = Number.isFinite(n);
  const pct = ok ? Math.max(0, Math.min(100, n)) : 0;
  const r = 54;
  const c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;
  const color = !ok ? '#6b7280' : n >= 80 ? '#3dd68c' : n >= 50 ? '#d4af37' : '#ff6b6b';
  return (
    <div className="admin-gauge" role="img" aria-label={label}>
      <svg viewBox="0 0 140 140" width="140" height="140">
        <circle cx="70" cy="70" r={r} fill="none" stroke="rgba(212,175,55,0.18)" strokeWidth="10" />
        <circle
          cx="70"
          cy="70"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`}
          transform="rotate(-90 70 70)"
        />
        <text x="70" y="76" textAnchor="middle" fill="#f5e6b8" fontSize="28" fontWeight="700">
          {ok ? Math.round(n) : '—'}
        </text>
      </svg>
    </div>
  );
}

function TrendChart({ series, lang }: { series: SeriesPoint[]; lang: string }) {
  const maxRev = Math.max(1, ...series.map((s) => s.revenueCents));
  return (
    <div className="admin-chart" role="img" aria-label={t(lang, 'master.chartAria')}>
      {series.map((row) => (
        <div key={row.date} className="admin-chart__col" title={`${row.date}`}>
          <span
            className="admin-chart__bar"
            style={{ height: `${Math.max(4, (row.revenueCents / maxRev) * 100)}%` }}
          />
          <span className="admin-chart__signups">{row.signups || ''}</span>
        </div>
      ))}
    </div>
  );
}

export default function MasterAdminPage() {
  const { lang, password } = useAdminAuth();
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState('');
  const [healBusy, setHealBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [hermes, setHermes] = useState<{
    configured?: boolean;
    active?: boolean;
    chatEnabled?: boolean;
    latencyMs?: number | null;
    ttftMs?: number | null;
    errorRate?: number;
    cacheHitRate?: number | null;
    toolEventCount?: number;
    lastToolEvents?: number;
    inflight?: number;
    maxInflight?: number;
    timeoutMs?: number;
    lastErrorCode?: string | null;
  } | null>(null);
  const [hermesBusy, setHermesBusy] = useState(false);
  const [insights, setInsights] = useState('');
  const [harnessProjects, setHarnessProjects] = useState<MasterProject[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState('resumora');

  const load = useCallback(async () => {
    setError('');
    try {
      const dashboard = await fetchMasterDashboard(password);
      setData(dashboard);
      try {
        const registry = await fetchMasterProjects(password);
        const list = registry.projects || dashboard.harness?.projects || [];
        setHarnessProjects(list);
        setSelectedProjectId((cur) =>
          list.find((p) => p.projectId === cur) ? cur : list[0]?.projectId || 'resumora'
        );
      } catch {
        setHarnessProjects(dashboard.harness?.projects || []);
      }
      try {
        const status = await fetchHermesStatus(password);
        setHermes(status);
      } catch {
        setHermes({ configured: false, active: false, chatEnabled: false });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t(lang, 'master.loadFailed'));
    }
  }, [password, lang]);

  useEffect(() => {
    void load();
  }, [load]);

  // Orchestration hash: #orchestration?project=resumora
  useEffect(() => {
    function applyHashProject() {
      const raw = String(window.location.hash || '');
      if (!raw.startsWith('#orchestration')) return;
      const qIndex = raw.indexOf('?');
      if (qIndex < 0) return;
      const params = new URLSearchParams(raw.slice(qIndex + 1));
      const project = String(params.get('project') || '').trim();
      if (!project) return;
      setSelectedProjectId(project);
    }
    applyHashProject();
    window.addEventListener('hashchange', applyHashProject);
    return () => window.removeEventListener('hashchange', applyHashProject);
  }, []);

  useEffect(() => {
    if (!harnessProjects.length) return;
    if (harnessProjects.some((p) => p.projectId === selectedProjectId)) return;
    setSelectedProjectId(harnessProjects[0]?.projectId || 'resumora');
  }, [harnessProjects, selectedProjectId]);

  function selectHarnessProject(projectId: string) {
    setSelectedProjectId(projectId);
    const next = `#orchestration?project=${encodeURIComponent(projectId)}`;
    if (window.location.hash !== next) {
      window.history.replaceState(
        null,
        '',
        `${window.location.pathname}${window.location.search}${next}`
      );
    }
  }

  function harnessConnectivity(p: MasterProject): 'online' | 'degraded' | 'offline' {
    if (p.live === true) return 'online';
    if (p.live === false || p.status === 'paused') return 'offline';
    const hs = Number(p.healthScore);
    if (p.status === 'building' || (Number.isFinite(hs) && hs < 70 && hs >= 40)) return 'degraded';
    if (p.status === 'active' && (!Number.isFinite(hs) || hs >= 70)) return 'online';
    if (Number.isFinite(hs) && hs < 40) return 'offline';
    return p.status === 'active' ? 'online' : 'offline';
  }

  async function runHeal() {
    setHealBusy(true);
    setNotice('');
    setError('');
    try {
      const res = await fetch('/api/admin/system-health/run', {
        method: 'POST',
        headers: adminHeaders(password, true),
        body: '{}',
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      setNotice(t(lang, 'master.healStarted'));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t(lang, 'heal.errorRun'));
    } finally {
      setHealBusy(false);
    }
  }

  async function toggleHermes(enabled: boolean) {
    setHermesBusy(true);
    setError('');
    try {
      const status = await setHermesChatEnabled(password, enabled);
      setHermes(status);
      setNotice(enabled ? t(lang, 'master.hermesEnabled') : t(lang, 'master.hermesDisabled'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t(lang, 'master.hermesToggleFailed'));
    } finally {
      setHermesBusy(false);
    }
  }

  async function loadInsights() {
    setHermesBusy(true);
    setError('');
    setInsights('');
    try {
      const out = await fetchHermesInsights(password, lang);
      setInsights(String(out.summary || ''));
      if (out.status) setHermes(out.status);
    } catch (err) {
      setError(err instanceof Error ? err.message : t(lang, 'master.hermesInsightsFailed'));
    } finally {
      setHermesBusy(false);
    }
  }

  const score = data?.globalHealth?.score ?? null;
  const series = data?.analytics?.series || [];

  return (
    <div className="admin-dashboard">
      <div className="admin-actions">
        <Link className="admin-master__btn" to="/admin/system-health">
          {t(lang, 'master.quickHealth')}
        </Link>
        <Link className="admin-master__btn admin-master__btn--ghost" to="/admin/refunds">
          {t(lang, 'master.quickRefunds')}
        </Link>
        <button
          type="button"
          className="admin-master__btn admin-master__btn--ghost"
          onClick={() => void runHeal()}
          disabled={healBusy}
        >
          {healBusy ? t(lang, 'heal.running') : t(lang, 'master.quickHeal')}
        </button>
        <button
          type="button"
          className="admin-master__btn admin-master__btn--ghost"
          onClick={() => void load()}
        >
          {t(lang, 'heal.refresh')}
        </button>
      </div>

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

      <section className="admin-hero admin-master__card">
        <div>
          <h2>{t(lang, 'master.healthTitle')}</h2>
          <p className="admin-master__lead">
            {tFormat(lang, 'master.healthMeta', {
              status: data?.globalHealth?.status || t(lang, 'heal.statusUnknown'),
              alerts: String(data?.criticalAlertCount ?? 0),
              pending: String(data?.pendingHealApprovals ?? 0),
            })}
          </p>
        </div>
        <HealthGauge score={score} label={t(lang, 'master.healthTitle')} />
      </section>

      <section className="admin-grid" aria-label={t(lang, 'master.projectsAria')}>
        {(data?.projects || []).map((p) => (
          <article key={p.id} className="admin-master__card admin-project">
            <header>
              <h3>{p.name}</h3>
              <span className={`admin-status admin-status--${p.status}`}>
                {t(lang, `master.status.${p.status}`) || p.status}
              </span>
            </header>
            <dl>
              <div>
                <dt>{t(lang, 'master.metricRevenue30')}</dt>
                <dd>{money(p.revenueCentsMonthly, lang)}</dd>
              </div>
              <div>
                <dt>{t(lang, 'master.metricRevenueTotal')}</dt>
                <dd>{money(p.revenueCentsTotal, lang)}</dd>
              </div>
              <div>
                <dt>{t(lang, 'master.metricUsers')}</dt>
                <dd>{p.activeUsers == null ? t(lang, 'master.metricNa') : p.activeUsers}</dd>
              </div>
              <div>
                <dt>{t(lang, 'master.metricUptime')}</dt>
                <dd>{p.uptimeLabel || t(lang, 'master.metricNa')}</dd>
              </div>
            </dl>
          </article>
        ))}
      </section>

      <section className="admin-master__card">
        <h2>{t(lang, 'master.chartTitle')}</h2>
        <p className="admin-master__lead">
          {tFormat(lang, 'master.chartMeta', {
            revenue: money(data?.analytics?.revenueCents30d, lang),
            signups: String(data?.analytics?.signups30d ?? 0),
          })}
        </p>
        {series.length ? (
          <TrendChart series={series} lang={lang} />
        ) : (
          <p>{t(lang, 'master.chartEmpty')}</p>
        )}
      </section>

      <section className="admin-master__card" aria-label={t(lang, 'master.feedTitle')}>
        <h2>{t(lang, 'master.feedTitle')}</h2>
        {(data?.feed || []).length ? (
          <ul className="admin-feed">
            {(data?.feed || []).map((item) => (
              <li key={`${item.kind}-${item.id}`}>
                <span className="admin-feed__kind">{item.kind}</span>
                <span>{item.title}</span>
                <time>{item.at ? String(item.at).slice(0, 16).replace('T', ' ') : ''}</time>
              </li>
            ))}
          </ul>
        ) : (
          <p className="admin-master__lead">{t(lang, 'master.feedEmpty')}</p>
        )}
      </section>

      <section id="orchestration" className="admin-master__card">
        <h2>{t(lang, 'master.harnessTitle')}</h2>
        <p className="admin-master__lead">
          {tFormat(lang, 'master.harnessLead', {
            avg:
              data?.harness?.averageHealth != null
                ? String(data.harness.averageHealth)
                : t(lang, 'master.metricNa'),
          })}
        </p>
        <div className="admin-harness-grid" aria-label={t(lang, 'master.harnessProjectsAria')}>
          {(harnessProjects.length ? harnessProjects : data?.harness?.projects || []).map((p) => {
            const score = p.healthScore;
            const conn = harnessConnectivity(p);
            const tone = conn === 'online' ? 'ok' : conn === 'degraded' ? 'warn' : 'bad';
            const selected = selectedProjectId === p.projectId;
            return (
              <button
                type="button"
                key={p.projectId}
                className={`admin-harness-card admin-harness-card--${tone}${
                  selected ? ' is-selected' : ''
                }`}
                onClick={() => selectHarnessProject(p.projectId)}
                aria-pressed={selected}
              >
                <header>
                  <h3>{p.name}</h3>
                  <span className={`admin-status admin-status--${p.status}`}>
                    {t(lang, `master.harnessStatus.${p.status}`) || p.status}
                  </span>
                </header>
                <p className={`admin-harness-live admin-harness-live--${conn}`}>
                  <span className="admin-harness-live__dot" aria-hidden="true" />
                  {conn === 'online'
                    ? t(lang, 'master.harnessOnline')
                    : conn === 'degraded'
                      ? t(lang, 'master.harnessDegraded')
                      : t(lang, 'master.harnessOffline')}
                </p>
                <p>
                  {t(lang, 'master.metricHealth')}:{' '}
                  {score != null ? `${Math.round(score)}%` : t(lang, 'master.metricNa')}
                </p>
                <ul className="admin-harness-tools">
                  {Object.entries(p.tools || {}).map(([tool, on]) => (
                    <li key={tool} className={on ? 'is-on' : 'is-off'}>
                      {tool}
                    </li>
                  ))}
                </ul>
                {selected ? (
                  <span className="admin-harness-chat-hint">
                    {t(lang, 'master.harnessChatReady')}
                  </span>
                ) : (
                  <span className="admin-harness-chat-hint">
                    {t(lang, 'master.harnessOpenChat')}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <AdminHermesCommandChat
          lang={lang}
          password={password}
          projectId={selectedProjectId}
          projectName={
            (harnessProjects.find((p) => p.projectId === selectedProjectId) || {}).name ||
            selectedProjectId
          }
        />
      </section>

      <section id="agents" className="admin-master__card">
        <h2>{t(lang, 'master.hermesTitle')}</h2>
        <p className="admin-master__lead">{t(lang, 'master.hermesLead')}</p>
        <dl className="admin-hermes-metrics">
          <div>
            <dt>{t(lang, 'master.hermesStatus')}</dt>
            <dd>
              {hermes?.active
                ? t(lang, 'master.hermesActive')
                : hermes?.configured
                  ? t(lang, 'master.hermesOffline')
                  : t(lang, 'master.hermesUnconfigured')}
            </dd>
          </div>
          <div>
            <dt>{t(lang, 'master.hermesLatency')}</dt>
            <dd>
              {hermes?.latencyMs != null
                ? tFormat(lang, 'master.hermesLatencyMs', { ms: String(hermes.latencyMs) })
                : t(lang, 'master.metricNa')}
            </dd>
          </div>
          <div>
            <dt>{t(lang, 'master.hermesErrorRate')}</dt>
            <dd>
              {hermes?.errorRate != null
                ? tFormat(lang, 'master.hermesErrorPct', { pct: String(hermes.errorRate) })
                : t(lang, 'master.metricNa')}
            </dd>
          </div>
        </dl>
        <h3 className="admin-hermes-perf-title">{t(lang, 'master.hermesPerfTitle')}</h3>
        <dl className="admin-hermes-metrics">
          <div>
            <dt>{t(lang, 'master.hermesTtft')}</dt>
            <dd>
              {hermes?.ttftMs != null
                ? tFormat(lang, 'master.hermesLatencyMs', { ms: String(hermes.ttftMs) })
                : t(lang, 'master.metricNa')}
            </dd>
          </div>
          <div>
            <dt>{t(lang, 'master.hermesCacheHit')}</dt>
            <dd>
              {hermes?.cacheHitRate != null
                ? tFormat(lang, 'master.hermesErrorPct', { pct: String(hermes.cacheHitRate) })
                : t(lang, 'master.metricNa')}
            </dd>
          </div>
          <div>
            <dt>{t(lang, 'master.hermesToolUsage')}</dt>
            <dd>
              {hermes?.toolEventCount != null
                ? String(hermes.toolEventCount)
                : t(lang, 'master.metricNa')}
            </dd>
          </div>
          <div>
            <dt>{t(lang, 'master.hermesInflight')}</dt>
            <dd>
              {hermes?.inflight != null && hermes?.maxInflight != null
                ? tFormat(lang, 'master.hermesInflightVal', {
                    n: String(hermes.inflight),
                    max: String(hermes.maxInflight),
                  })
                : t(lang, 'master.metricNa')}
            </dd>
          </div>
        </dl>
        <label className="admin-hermes-toggle">
          <input
            type="checkbox"
            checked={Boolean(hermes?.chatEnabled)}
            disabled={hermesBusy}
            onChange={(e) => void toggleHermes(e.target.checked)}
          />
          {t(lang, 'master.hermesChatToggle')}
        </label>
        <button
          type="button"
          className="admin-master__btn admin-master__btn--ghost"
          disabled={hermesBusy}
          onClick={() => void loadInsights()}
        >
          {hermesBusy ? t(lang, 'master.hermesWorking') : t(lang, 'master.hermesInsights')}
        </button>
        {insights ? <pre className="admin-hermes-insights">{insights}</pre> : null}
      </section>

      <section id="users" className="admin-master__card">
        <h2>{t(lang, 'master.usersTitle')}</h2>
        <p>
          {tFormat(lang, 'master.usersBody', {
            count: String(
              data?.projects?.find((p) => p.id === 'resumora')?.activeUsers ??
                t(lang, 'master.metricNa')
            ),
          })}
        </p>
      </section>

      <section id="settings" className="admin-master__card">
        <h2>{t(lang, 'master.settingsTitle')}</h2>
        <p className="admin-master__lead">{t(lang, 'master.settingsBody')}</p>
        <Link to="/admin/system-health">{t(lang, 'master.quickHealth')}</Link>
      </section>
    </div>
  );
}
