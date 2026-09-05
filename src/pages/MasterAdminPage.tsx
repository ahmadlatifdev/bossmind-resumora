import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAdminAuth } from '../components/AdminAuthGate';
import { mapAdminStatus, toAdminEnglish } from '../lib/adminEnglishLabels';
import FinancialDashboardPanel, { type FinancialDashboard } from '../components/FinancialDashboard';
import {
  fetchMasterDashboard,
  adminHeaders,
  fetchHermesStatus,
  setHermesChatEnabled,
  fetchHermesInsights,
  fetchMasterProjects,
  fetchHarnessTasks,
  createHarnessTask,
  ackHarnessTask,
  markHarnessTaskApplied,
  setHarnessAutomation,
  fetchAdminFinancials,
  runFinanceAllocation,
  updateMasterProjectStatus,
  probeHermesLocalHealth,
  ownerGlobalHealthCheck,
  ownerReviewUpdateAll,
  ownerSetProjectStatus,
  type MasterProject,
  type HarnessTask,
} from '../lib/adminApi';
import AdminHermesCommandChat from '../components/AdminHermesCommandChat';
import { t, tFormat } from '../lib/i18n.js';

const SELECTED_PROJECT_KEY = 'resumora_admin_selected_project';

function readStoredProjectId(): string {
  try {
    return sessionStorage.getItem(SELECTED_PROJECT_KEY) || 'resumora';
  } catch {
    return 'resumora';
  }
}

function writeStoredProjectId(projectId: string) {
  try {
    sessionStorage.setItem(SELECTED_PROJECT_KEY, projectId);
  } catch {
    /* ignore */
  }
}

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
  return new Intl.NumberFormat('en-US', {
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
  const { lang, password, ownerMode, ownerPassword } = useAdminAuth();
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState('');
  const [healBusy, setHealBusy] = useState(false);
  const [refreshBusy, setRefreshBusy] = useState(false);
  const [showRefreshSpinner, setShowRefreshSpinner] = useState(false);
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
  const [selectedProjectId, setSelectedProjectId] = useState(readStoredProjectId);
  const [tasks, setTasks] = useState<HarnessTask[]>([]);
  const [tasksBusy, setTasksBusy] = useState(false);
  const [autoDeployAfterAck, setAutoDeployAfterAck] = useState(false);
  const [financials, setFinancials] = useState<FinancialDashboard | null>(null);
  const [financeBusy, setFinanceBusy] = useState(false);
  const [projectStatusBusy, setProjectStatusBusy] = useState<string | null>(null);
  const [ownerBusy, setOwnerBusy] = useState(false);
  const [ownerLogs, setOwnerLogs] = useState<string>('');

  const loadTasks = useCallback(
    async (opts?: { quiet?: boolean }) => {
      try {
        const out = await fetchHarnessTasks(password);
        setTasks(out.tasks || []);
        setAutoDeployAfterAck(Boolean(out.settings?.autoDeployAfterAck));
        if (!opts?.quiet) setNotice(t(lang, 'master.tasksRefreshed'));
      } catch (err) {
        if (!opts?.quiet) {
          setError(err instanceof Error ? err.message : t(lang, 'master.tasksFailed'));
        }
      }
    },
    [password, lang]
  );

  const loadFinancials = useCallback(
    async (opts?: { quiet?: boolean }) => {
      try {
        const out = await fetchAdminFinancials(password);
        setFinancials(out.financials || null);
      } catch (err) {
        if (!opts?.quiet) {
          setError(err instanceof Error ? err.message : t(lang, 'master.financeFailed'));
        }
      }
    },
    [password, lang]
  );

  const load = useCallback(
    async (opts?: { quiet?: boolean }) => {
      setError('');
      setRefreshBusy(true);
      try {
        const dashboard = await fetchMasterDashboard(password);
        setData(dashboard);
        try {
          const registry = await fetchMasterProjects(password);
          const list = registry.projects || dashboard.harness?.projects || [];
          setHarnessProjects(list);
          setSelectedProjectId((cur) => {
            const next = list.find((p) => p.projectId === cur)
              ? cur
              : list[0]?.projectId || 'resumora';
            writeStoredProjectId(next);
            return next;
          });
        } catch {
          setHarnessProjects(dashboard.harness?.projects || []);
        }
        try {
          const status = await fetchHermesStatus(password);
          setHermes(status);
        } catch {
          setHermes({ configured: false, active: false, chatEnabled: false });
        }
        await loadTasks({ quiet: true });
        await loadFinancials({ quiet: true });
        if (!opts?.quiet) setNotice(t(lang, 'master.dashboardRefreshed'));
      } catch (err) {
        setError(err instanceof Error ? err.message : t(lang, 'master.loadFailed'));
      } finally {
        setRefreshBusy(false);
      }
    },
    [password, lang, loadTasks, loadFinancials]
  );

  useEffect(() => {
    void load({ quiet: true });
  }, [load]);

  // Zero-refresh auto-recovery sync (10s) — never leave Resumora stuck PAUSED.
  useEffect(() => {
    let cancelled = false;

    async function syncOnce() {
      try {
        const registry = await fetchMasterProjects(password);
        if (cancelled) return;
        const list = registry.projects || [];
        setHarnessProjects(list);

        const resumora = list.find((p) => p.projectId === 'resumora');
        let hermesUp = false;
        try {
          hermesUp = await probeHermesLocalHealth();
        } catch {
          hermesUp = false;
        }
        console.log(
          `[auto-recovery] ui tick hermes=${hermesUp ? 'up' : 'down'} status=${resumora?.status || 'n/a'}`
        );

        if (!resumora) return;

        // Only auto-activate when local Hermes queue is healthy.
        // Do not mark OFFLINE from the browser alone (queue monitor owns degradation).
        if (hermesUp && (resumora.status === 'paused' || resumora.status === 'offline')) {
          console.log('[auto-recovery] ui activating Resumora → active');
          patchHarnessProject('resumora', { status: 'active', live: true });
          try {
            let lastErr: unknown = null;
            for (let i = 1; i <= 3; i++) {
              try {
                const out = await updateMasterProjectStatus(
                  password,
                  'resumora',
                  'active',
                  'auto-recovery-ui'
                );
                if (out.project) {
                  patchHarnessProject('resumora', {
                    status: out.project.status,
                    live: out.project.live,
                  });
                }
                lastErr = null;
                break;
              } catch (err) {
                lastErr = err;
                console.warn(`[auto-recovery] ui activate retry ${i}/3`, err);
                await new Promise((r) => setTimeout(r, 400 * i));
              }
            }
            if (lastErr) throw lastErr;
          } catch (err) {
            console.error('[auto-recovery] ui activate failed', err);
            patchHarnessProject('resumora', {
              status: resumora.status,
              live: resumora.live,
            });
          }
        }
      } catch (err) {
        console.warn('[auto-recovery] ui sync tick failed', err);
      }
    }

    void syncOnce();
    const timer = window.setInterval(() => void syncOnce(), 10_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
    // patchHarnessProject is stable enough via setState; password drives auth
  }, [password]);

  useEffect(() => {
    if (!refreshBusy) {
      setShowRefreshSpinner(false);
      return;
    }
    const timer = window.setTimeout(() => setShowRefreshSpinner(true), 400);
    return () => window.clearTimeout(timer);
  }, [refreshBusy]);

  useEffect(() => {
    writeStoredProjectId(selectedProjectId);
  }, [selectedProjectId]);

  // Hash: #orchestration?project=resumora | #hermes-chat?project=resumora + section scroll
  useEffect(() => {
    function sectionIdFromHash(raw: string): string {
      const bare = String(raw || '').replace(/^#/, '');
      if (!bare) return '';
      return bare.split('?')[0] || '';
    }

    function applyHash() {
      const raw = String(window.location.hash || '');
      const section = sectionIdFromHash(raw);
      if (raw.includes('orchestration') || raw.includes('hermes-chat')) {
        const qIndex = raw.indexOf('?');
        if (qIndex >= 0) {
          const params = new URLSearchParams(raw.slice(qIndex + 1));
          const project = String(params.get('project') || '').trim();
          if (project) setSelectedProjectId(project);
        }
      }
      if (!section) return;
      window.requestAnimationFrame(() => {
        document.getElementById(section)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
    applyHash();
    window.addEventListener('hashchange', applyHash);
    return () => window.removeEventListener('hashchange', applyHash);
  }, [data, harnessProjects.length]);

  useEffect(() => {
    if (!harnessProjects.length) return;
    if (harnessProjects.some((p) => p.projectId === selectedProjectId)) return;
    const next = harnessProjects[0]?.projectId || 'resumora';
    setSelectedProjectId(next);
    writeStoredProjectId(next);
  }, [harnessProjects, selectedProjectId]);

  function selectHarnessProject(
    projectId: string,
    hashBase: 'orchestration' | 'hermes-chat' = 'orchestration'
  ) {
    setSelectedProjectId(projectId);
    writeStoredProjectId(projectId);
    const next = `#${hashBase}?project=${encodeURIComponent(projectId)}`;
    if (window.location.hash !== next) {
      window.history.replaceState(
        null,
        '',
        `${window.location.pathname}${window.location.search}${next}`
      );
    }
  }

  function openHermesChatForProject(projectId: string) {
    selectHarnessProject(projectId, 'hermes-chat');
    window.requestAnimationFrame(() => {
      document
        .getElementById('hermes-chat')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  function publicUrlFor(p: MasterProject): string {
    const url = String(p.envRegistry?.PUBLIC_URL || '').trim();
    if (/^https?:\/\//i.test(url)) return url;
    return '';
  }

  function harnessConnectivity(p: MasterProject): 'online' | 'degraded' | 'offline' {
    if (p.status === 'offline' || p.status === 'paused') return 'offline';
    if (p.status === 'active' || p.status === 'running' || p.live === true) return 'online';
    if (p.live === false) return 'offline';
    const hs = Number(p.healthScore);
    if (p.status === 'building' || (Number.isFinite(hs) && hs < 70 && hs >= 40)) return 'degraded';
    if (Number.isFinite(hs) && hs < 40) return 'offline';
    return 'offline';
  }

  function patchHarnessProject(projectId: string, patch: Partial<MasterProject>) {
    setHarnessProjects((prev) =>
      prev.map((row) => (row.projectId === projectId ? { ...row, ...patch } : row))
    );
    setData((cur) => {
      if (!cur?.harness?.projects) return cur;
      return {
        ...cur,
        harness: {
          ...cur.harness,
          projects: cur.harness.projects.map((row) =>
            row.projectId === projectId ? { ...row, ...patch } : row
          ),
        },
      };
    });
  }

  async function onToggleProjectStatus(p: MasterProject) {
    const nextStatus = p.status === 'paused' ? 'active' : 'paused';
    await onSetProjectStatus(p, nextStatus);
  }

  async function onSetProjectStatus(
    p: MasterProject,
    nextStatus: 'active' | 'paused' | 'building' | 'offline'
  ) {
    const previous = { ...p };
    setError('');
    setProjectStatusBusy(p.projectId);
    patchHarnessProject(p.projectId, {
      status: nextStatus,
      live: nextStatus === 'active',
    });
    setNotice(
      nextStatus === 'active'
        ? tFormat(lang, 'master.harnessActivated', { name: p.name || p.projectId })
        : nextStatus === 'paused'
          ? tFormat(lang, 'master.harnessPausedOk', { name: p.name || p.projectId })
          : tFormat(lang, 'master.ownerStatusSet', {
              name: p.name || p.projectId,
              status: nextStatus,
            })
    );
    try {
      const out =
        ownerMode && ownerPassword
          ? await ownerSetProjectStatus(ownerPassword, p.projectId, nextStatus)
          : await updateMasterProjectStatus(password, p.projectId, nextStatus);
      if (out.project) {
        patchHarnessProject(p.projectId, {
          status: out.project.status,
          live: out.project.live,
          healthScore: out.project.healthScore,
        });
      }
    } catch (err) {
      patchHarnessProject(p.projectId, {
        status: previous.status,
        live: previous.live,
      });
      setError(err instanceof Error ? err.message : t(lang, 'master.harnessStatusFailed'));
      setNotice('');
    } finally {
      setProjectStatusBusy(null);
    }
  }

  async function onOwnerGlobalHealth() {
    if (!ownerPassword) return;
    setOwnerBusy(true);
    setError('');
    try {
      const out = await ownerGlobalHealthCheck(ownerPassword);
      if (out.projects?.length) setHarnessProjects(out.projects);
      const logs = Array.isArray(out.logs) ? out.logs : [];
      setOwnerLogs(
        logs.length ? JSON.stringify(logs.slice(0, 20), null, 2) : t(lang, 'master.ownerLogsEmpty')
      );
      setNotice(t(lang, 'master.ownerGlobalHealthOk'));
      await load({ quiet: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : t(lang, 'master.ownerGlobalHealthFailed'));
    } finally {
      setOwnerBusy(false);
    }
  }

  async function onOwnerReviewUpdateAll() {
    if (!ownerPassword) return;
    if (!window.confirm(t(lang, 'master.ownerReviewConfirm'))) return;
    setOwnerBusy(true);
    setError('');
    try {
      const out = await ownerReviewUpdateAll(ownerPassword, 'active');
      const list = out.batch?.projects || out.projects || [];
      if (list.length) {
        setHarnessProjects((prev) => {
          const byId = new Map(list.map((p) => [p.projectId, p]));
          return prev.map((row) => byId.get(row.projectId) || row);
        });
      }
      setNotice(t(lang, 'master.ownerReviewOk'));
      await load({ quiet: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : t(lang, 'master.ownerReviewFailed'));
    } finally {
      setOwnerBusy(false);
    }
  }

  function healthTone(score: number | null | undefined): 'ok' | 'warn' | 'bad' | 'na' {
    const n = Number(score);
    if (!Number.isFinite(n)) return 'na';
    if (n >= 80) return 'ok';
    if (n >= 50) return 'warn';
    return 'bad';
  }

  async function runHeal() {
    if (!window.confirm(t(lang, 'master.healConfirm'))) return;
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
      await load({ quiet: true });
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

  async function onAckTask(taskId: string, ack: boolean) {
    setTasksBusy(true);
    setError('');
    try {
      await ackHarnessTask(password, { taskId, ack, reject: !ack, note: ack ? 'ACK' : 'reject' });
      setNotice(ack ? t(lang, 'master.tasksAckOk') : t(lang, 'master.tasksRejectOk'));
      await loadTasks({ quiet: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : t(lang, 'master.tasksFailed'));
    } finally {
      setTasksBusy(false);
    }
  }

  async function onMarkApplied(taskId: string) {
    setTasksBusy(true);
    setError('');
    try {
      await markHarnessTaskApplied(password, taskId, 'dashboard');
      setNotice(t(lang, 'master.tasksAppliedOk'));
      await loadTasks({ quiet: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : t(lang, 'master.tasksFailed'));
    } finally {
      setTasksBusy(false);
    }
  }

  async function onCreateSampleTask() {
    setTasksBusy(true);
    setError('');
    try {
      await createHarnessTask(password, {
        description:
          'Sample: set LOG_LEVEL=info on Resumora backend (ACK then apply locally; do not auto-deploy secrets).',
        projectId: 'resumora',
        actor: 'admin',
        risk: 'low',
        commands: [
          'gcloud run services update postadminhermescommand --region=us-central1 --project=resumora-live --update-env-vars=LOG_LEVEL=info',
        ],
        codeDiff:
          '// Read process.env.LOG_LEVEL in Functions structured logs (no secret values).\n',
      });
      setNotice(t(lang, 'master.tasksCreateOk'));
      await loadTasks({ quiet: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : t(lang, 'master.tasksFailed'));
    } finally {
      setTasksBusy(false);
    }
  }

  async function onRefreshTasks() {
    setTasksBusy(true);
    setError('');
    try {
      await loadTasks();
    } finally {
      setTasksBusy(false);
    }
  }

  async function onToggleAutoDeploy(enabled: boolean) {
    setTasksBusy(true);
    setError('');
    try {
      await setHarnessAutomation(password, { autoDeployAfterAck: enabled });
      setAutoDeployAfterAck(enabled);
      setNotice(
        enabled ? t(lang, 'master.tasksAutoDeployOn') : t(lang, 'master.tasksAutoDeployOff')
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : t(lang, 'master.tasksFailed'));
    } finally {
      setTasksBusy(false);
    }
  }

  async function onRefreshFinancials() {
    setFinanceBusy(true);
    setError('');
    try {
      await loadFinancials();
      setNotice(t(lang, 'master.financeRefreshed'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t(lang, 'master.financeFailed'));
    } finally {
      setFinanceBusy(false);
    }
  }

  async function onRunAllocation() {
    setFinanceBusy(true);
    setError('');
    try {
      const out = await runFinanceAllocation(password);
      setNotice(
        out.skipped ? t(lang, 'master.financeAllocSkipped') : t(lang, 'master.financeAllocOk')
      );
      await loadFinancials();
    } catch (err) {
      setError(err instanceof Error ? err.message : t(lang, 'master.financeFailed'));
    } finally {
      setFinanceBusy(false);
    }
  }

  const score = data?.globalHealth?.score ?? null;
  const series = data?.analytics?.series || [];

  return (
    <div className="admin-dashboard" aria-busy={refreshBusy || healBusy}>
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
          disabled={healBusy || refreshBusy}
          aria-label={t(lang, 'master.quickHeal')}
        >
          {healBusy ? t(lang, 'heal.running') : t(lang, 'master.quickHeal')}
        </button>
        <button
          type="button"
          className="admin-master__btn admin-master__btn--ghost"
          onClick={() => void load()}
          disabled={refreshBusy || healBusy}
          aria-label={t(lang, 'heal.refresh')}
        >
          {showRefreshSpinner || refreshBusy
            ? t(lang, 'master.refreshing')
            : t(lang, 'heal.refresh')}
        </button>
      </div>

      {showRefreshSpinner ? (
        <p className="admin-master__lead admin-refresh-spinner" role="status" aria-live="polite">
          {t(lang, 'master.refreshing')}
        </p>
      ) : null}

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
                {t(lang, `master.status.${p.status}`) || mapAdminStatus(p.status)}
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
                <span className="admin-feed__kind">{toAdminEnglish(item.kind)}</span>
                <span>{toAdminEnglish(item.title)}</span>
                {item.status ? (
                  <span className="admin-feed__status">{mapAdminStatus(item.status)}</span>
                ) : null}
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
        {ownerMode ? (
          <div className="admin-owner-actions">
            <button
              type="button"
              className="admin-master__btn"
              disabled={ownerBusy}
              onClick={() => void onOwnerGlobalHealth()}
            >
              {ownerBusy ? t(lang, 'master.ownerWorking') : t(lang, 'master.ownerGlobalHealth')}
            </button>
            <button
              type="button"
              className="admin-master__btn"
              disabled={ownerBusy}
              onClick={() => void onOwnerReviewUpdateAll()}
            >
              {ownerBusy ? t(lang, 'master.ownerWorking') : t(lang, 'master.ownerReviewAll')}
            </button>
            <p className="admin-master__lead admin-owner-actions__hint">
              {t(lang, 'master.ownerOrchestrationHint')}
            </p>
          </div>
        ) : null}
        {ownerLogs ? (
          <pre className="admin-owner-logs" aria-label={t(lang, 'master.ownerLogsAria')}>
            {ownerLogs}
          </pre>
        ) : null}
        <div className="admin-harness-grid" aria-label={t(lang, 'master.harnessProjectsAria')}>
          {(harnessProjects.length ? harnessProjects : data?.harness?.projects || []).map((p) => {
            const score = p.healthScore;
            const conn = harnessConnectivity(p);
            const tone = conn === 'online' ? 'ok' : conn === 'degraded' ? 'warn' : 'bad';
            const selected = selectedProjectId === p.projectId;
            const visitUrl = publicUrlFor(p);
            const hTone = healthTone(score);
            const canControl = ownerMode || p.projectId === 'resumora';
            return (
              <div
                key={p.projectId}
                className={`admin-harness-card admin-harness-card--${tone}${
                  selected ? ' is-selected' : ''
                }${ownerMode ? ' is-owner-unlocked' : ''}`}
              >
                <button
                  type="button"
                  className="admin-harness-card__select"
                  onClick={() => selectHarnessProject(p.projectId)}
                  aria-pressed={selected}
                  aria-label={`${p.name} — ${t(lang, 'master.harnessOpenChat')}`}
                >
                  <header>
                    <h3>{p.name}</h3>
                    <span className={`admin-status admin-status--${p.status}`}>
                      {t(lang, `master.harnessStatus.${p.status}`) || mapAdminStatus(p.status)}
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
                  <p className={`admin-harness-score admin-harness-score--${hTone}`}>
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
                </button>
                <div className="admin-harness-card__actions">
                  <button
                    type="button"
                    className="admin-master__btn"
                    onClick={() => openHermesChatForProject(p.projectId)}
                  >
                    {t(lang, 'master.harnessOpenChatBtn')}
                  </button>
                  {visitUrl ? (
                    <a
                      className="admin-master__btn admin-master__btn--ghost"
                      href={visitUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {t(lang, 'master.harnessVisit')}
                    </a>
                  ) : (
                    <span className="admin-harness-no-url">{t(lang, 'master.harnessNoUrl')}</span>
                  )}
                  {canControl ? (
                    <>
                      {ownerMode ? (
                        <label className="admin-owner-status">
                          <span className="admin-sr-only">{t(lang, 'master.ownerSetStatus')}</span>
                          <select
                            value={
                              ['active', 'paused', 'building', 'offline'].includes(p.status)
                                ? p.status
                                : 'offline'
                            }
                            disabled={projectStatusBusy === p.projectId}
                            onChange={(e) =>
                              void onSetProjectStatus(
                                p,
                                e.target.value as 'active' | 'paused' | 'building' | 'offline'
                              )
                            }
                            aria-label={`${p.name} status`}
                          >
                            <option value="active">{t(lang, 'master.harnessStatus.active')}</option>
                            <option value="offline">
                              {t(lang, 'master.harnessStatus.offline')}
                            </option>
                            <option value="paused">{t(lang, 'master.harnessStatus.paused')}</option>
                            <option value="building">
                              {t(lang, 'master.harnessStatus.building')}
                            </option>
                          </select>
                        </label>
                      ) : null}
                      <button
                        type="button"
                        className="admin-master__btn admin-master__btn--ghost"
                        disabled={projectStatusBusy === p.projectId}
                        onClick={() => void onToggleProjectStatus(p)}
                      >
                        {projectStatusBusy === p.projectId
                          ? t(lang, 'master.harnessStatusBusy')
                          : p.status === 'paused'
                            ? t(lang, 'master.harnessResume')
                            : t(lang, 'master.harnessPause')}
                      </button>
                    </>
                  ) : (
                    <p className="admin-master__lead admin-harness-pause-note">
                      {t(lang, 'master.harnessPauseNa')}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
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

      <section id="hermes-chat" className="admin-master__card admin-hermes-chat-panel">
        <h2>{t(lang, 'master.hermesChatTitle')}</h2>
        <p className="admin-master__lead">{t(lang, 'master.hermesChatPanelLead')}</p>
        <label className="admin-hermes-project">
          <span>{t(lang, 'master.hermesChatProject')}</span>
          <select
            value={selectedProjectId}
            onChange={(e) => selectHarnessProject(e.target.value, 'hermes-chat')}
            aria-label={t(lang, 'master.hermesChatProject')}
          >
            {(harnessProjects.length
              ? harnessProjects
              : data?.harness?.projects?.length
                ? data.harness.projects
                : [{ projectId: 'resumora', name: 'Resumora', status: 'active' } as MasterProject]
            ).map((p) => (
              <option key={p.projectId} value={p.projectId}>
                {p.name || p.projectId}
              </option>
            ))}
          </select>
        </label>
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

      <section id="tasks" className="admin-master__card">
        <h2>{t(lang, 'master.tasksTitle')}</h2>
        <p className="admin-master__lead">{t(lang, 'master.tasksLead')}</p>
        <div className="admin-tasks-toolbar">
          <button
            type="button"
            className="admin-master__btn admin-master__btn--ghost"
            disabled={tasksBusy}
            onClick={() => void onRefreshTasks()}
          >
            {tasksBusy ? t(lang, 'master.tasksBusy') : t(lang, 'master.tasksRefresh')}
          </button>
          <button
            type="button"
            className="admin-master__btn admin-master__btn--ghost"
            disabled={tasksBusy}
            onClick={() => void onCreateSampleTask()}
          >
            {t(lang, 'master.tasksCreateSample')}
          </button>
          <label className="admin-hermes-toggle">
            <input
              type="checkbox"
              checked={autoDeployAfterAck}
              disabled={tasksBusy}
              onChange={(e) => void onToggleAutoDeploy(e.target.checked)}
            />
            {t(lang, 'master.tasksAutoDeploy')}
          </label>
        </div>
        {tasks.length ? (
          <ul className="admin-tasks-list">
            {tasks.map((task) => (
              <li key={task.id} className="admin-tasks-item">
                <header>
                  <strong>{task.id}</strong>
                  <span className={`admin-status admin-status--${task.status || 'pending'}`}>
                    {mapAdminStatus(task.status || 'pending')}
                  </span>
                </header>
                <p>{task.description}</p>
                {task.commands?.length ? (
                  <pre className="admin-tasks-commands">{task.commands.join('\n')}</pre>
                ) : null}
                <div className="admin-tasks-actions">
                  {task.status === 'pending' ? (
                    <>
                      <button
                        type="button"
                        className="admin-master__btn"
                        disabled={tasksBusy}
                        onClick={() => void onAckTask(task.id, true)}
                      >
                        {t(lang, 'master.tasksAck')}
                      </button>
                      <button
                        type="button"
                        className="admin-master__btn admin-master__btn--ghost"
                        disabled={tasksBusy}
                        onClick={() => void onAckTask(task.id, false)}
                      >
                        {t(lang, 'master.tasksReject')}
                      </button>
                    </>
                  ) : null}
                  {task.status === 'acked' ? (
                    <button
                      type="button"
                      className="admin-master__btn admin-master__btn--ghost"
                      disabled={tasksBusy}
                      onClick={() => void onMarkApplied(task.id)}
                    >
                      {t(lang, 'master.tasksMarkApplied')}
                    </button>
                  ) : null}
                  {task.deployRunUrl ? (
                    <a href={task.deployRunUrl} target="_blank" rel="noreferrer">
                      deploy run
                    </a>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="admin-master__lead">{t(lang, 'master.tasksEmpty')}</p>
        )}
      </section>

      <FinancialDashboardPanel
        data={financials}
        busy={financeBusy}
        onRefresh={() => void onRefreshFinancials()}
        onRunAllocation={() => void onRunAllocation()}
      />

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
        <p className="admin-master__lead">{t(lang, 'master.usersManageNa')}</p>
      </section>

      <section id="settings" className="admin-master__card">
        <h2>{t(lang, 'master.settingsTitle')}</h2>
        <p className="admin-master__lead">{t(lang, 'master.settingsBody')}</p>
        <p className="admin-master__lead">{t(lang, 'master.settingsNoirNote')}</p>
        <Link to="/admin/system-health">{t(lang, 'master.quickHealth')}</Link>
      </section>
    </div>
  );
}
