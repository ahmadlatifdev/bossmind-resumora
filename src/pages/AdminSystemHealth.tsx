import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { t } from '../lib/i18n.js';
import '../app-shell.css';

/** Admin health page is English-only (same policy as Master Admin). */
const ADMIN_LANG = 'en';

const HEALTH_URL = '/api/admin/system-health';
const RUN_URL = '/api/admin/system-health/run';
const DECIDE_URL = '/api/admin/system-health/decide';
const MANUAL_UPDATE_URL = '/api/admin/system-manual/update';
const SESSION_KEY = 'resumora_admin_heal_pw';

type DocumentationStatus = {
  lastUpdated?: string | null;
  changelogSynced?: boolean;
  changelogGitSha?: string | null;
  trigger?: string | null;
  aiProvider?: string | null;
  summaryPreview?: string | null;
};

type Finding = {
  code?: string;
  severity?: string;
  rcaKey?: string;
  detail?: Record<string, unknown>;
};

type HealthDoc = {
  score?: number;
  status?: string;
  cycleId?: string;
  updatedAt?: string | null;
  findings?: Finding[];
  activeRemediations?: string[];
  lastGuardian?: { passed?: boolean; checks?: Record<string, unknown> };
  lastExecuted?: Array<{ actionId?: string; result?: { ok?: boolean } }>;
  stripeAccount?: {
    needsAttention?: boolean;
    payoutsEnabled?: boolean;
    chargesEnabled?: boolean;
    kycPending?: boolean;
    currentlyDueCount?: number;
    pastDueCount?: number;
    disabledReason?: string | null;
    checkedAt?: string;
  } | null;
};

function scoreColor(score?: number) {
  const n = Number(score) || 0;
  if (n >= 90) return '#3dd68c';
  if (n >= 70) return '#d4af37';
  if (n >= 40) return '#f0a060';
  return '#ff6b6b';
}

export default function AdminSystemHealthPage() {
  const lang = ADMIN_LANG;
  const [password, setPassword] = useState(() => sessionStorage.getItem(SESSION_KEY) || '');
  const [unlocked, setUnlocked] = useState(() => Boolean(sessionStorage.getItem(SESSION_KEY)));
  const [health, setHealth] = useState<HealthDoc | null>(null);
  const [incidents, setIncidents] = useState<Array<Record<string, unknown>>>([]);
  const [remediations, setRemediations] = useState<Array<Record<string, unknown>>>([]);
  const [pending, setPending] = useState<Array<Record<string, unknown>>>([]);
  const [notifications, setNotifications] = useState<Array<Record<string, unknown>>>([]);
  const [circuitBreakers, setCircuitBreakers] = useState<Array<Record<string, unknown>>>([]);
  const [firstTimeStats, setFirstTimeStats] = useState<{
    attempted?: number;
    remediated?: number;
    successRate?: number | null;
  } | null>(null);
  const [rollbackHistory, setRollbackHistory] = useState<Array<Record<string, unknown>>>([]);
  const [documentation, setDocumentation] = useState<DocumentationStatus | null>(null);
  const [manualBusy, setManualBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(
    async (pw: string) => {
      setLoading(true);
      setError('');
      try {
        const res = await fetch(HEALTH_URL, { headers: { 'X-Admin-Password': pw } });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        setHealth((data.health as HealthDoc) || null);
        setIncidents(Array.isArray(data.incidents) ? data.incidents : []);
        setRemediations(Array.isArray(data.remediations) ? data.remediations : []);
        setPending(Array.isArray(data.pendingApprovals) ? data.pendingApprovals : []);
        setNotifications(Array.isArray(data.notificationHistory) ? data.notificationHistory : []);
        setCircuitBreakers(Array.isArray(data.circuitBreakers) ? data.circuitBreakers : []);
        setFirstTimeStats(
          data.firstTimeStats && typeof data.firstTimeStats === 'object'
            ? (data.firstTimeStats as {
                attempted?: number;
                remediated?: number;
                successRate?: number | null;
              })
            : null
        );
        setRollbackHistory(Array.isArray(data.rollbackHistory) ? data.rollbackHistory : []);
        setDocumentation(
          data.documentation && typeof data.documentation === 'object'
            ? (data.documentation as DocumentationStatus)
            : null
        );
        setUnlocked(true);
        sessionStorage.setItem(SESSION_KEY, pw);
      } catch (err) {
        setUnlocked(false);
        sessionStorage.removeItem(SESSION_KEY);
        setHealth(null);
        setError(err instanceof Error ? err.message : t(lang, 'heal.errorLoad'));
      } finally {
        setLoading(false);
      }
    },
    [lang]
  );

  useEffect(() => {
    if (unlocked && password) void load(password);
  }, [unlocked, password, load]);

  async function onUnlock(e: FormEvent) {
    e.preventDefault();
    await load(password.trim());
  }

  async function runCycle() {
    setRunning(true);
    setNotice('');
    setError('');
    try {
      const res = await fetch(RUN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Password': password,
        },
        body: '{}',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setNotice(
        t(lang, 'heal.runOk')
          .replace('{score}', String(data.score ?? '╬ô├ç├╢'))
          .replace('{status}', String(data.status ?? '╬ô├ç├╢'))
      );
      await load(password);
    } catch (err) {
      setError(err instanceof Error ? err.message : t(lang, 'heal.errorRun'));
    } finally {
      setRunning(false);
    }
  }

  async function decide(approvalId: string, decision: 'approve' | 'reject') {
    setError('');
    setNotice('');
    try {
      const res = await fetch(DECIDE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Password': password,
        },
        body: JSON.stringify({ approvalId, decision }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setNotice(decision === 'approve' ? t(lang, 'heal.approved') : t(lang, 'heal.rejected'));
      await load(password);
    } catch (err) {
      setError(err instanceof Error ? err.message : t(lang, 'heal.errorDecide'));
    }
  }

  async function regenerateManual() {
    setManualBusy(true);
    setError('');
    setNotice('');
    try {
      const res = await fetch(MANUAL_UPDATE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Password': password,
        },
        body: JSON.stringify({ trigger: 'admin_dashboard' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setNotice(t(lang, 'manual.regenerateOk'));
      await load(password);
    } catch (err) {
      setError(err instanceof Error ? err.message : t(lang, 'manual.regenerateFail'));
    } finally {
      setManualBusy(false);
    }
  }

  return (
    <div className="app-shell">
      <header
        className="app-header site-header site-header--logo-lang-only"
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
      >
        <a href="/" className="site-logo" aria-label="RESUMORA.NET">
          <img
            className="site-logo__mark"
            src="/resumora-logo.png"
            alt=""
            width={56}
            height={56}
            decoding="async"
          />
        </a>
      </header>

      <main className="app-main" style={{ maxWidth: 960 }}>
        <h1>{t(lang, 'heal.title')}</h1>
        <p className="lead">{t(lang, 'heal.lead')}</p>

        {!unlocked ? (
          <form className="panel" onSubmit={onUnlock}>
            <label>
              {t(lang, 'heal.adminPassword')}
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full"
                autoComplete="current-password"
                required
              />
            </label>
            <button type="submit" className="primary" disabled={loading}>
              {t(lang, 'heal.unlock')}
            </button>
          </form>
        ) : (
          <>
            <div className="row-actions">
              <button
                type="button"
                className="primary"
                onClick={() => void runCycle()}
                disabled={running}
              >
                {running ? t(lang, 'heal.running') : t(lang, 'heal.runNow')}
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => void load(password)}
                disabled={loading}
              >
                {t(lang, 'heal.refresh')}
              </button>
            </div>

            {error ? (
              <p className="plan-chip warn" role="alert">
                {error}
              </p>
            ) : null}
            {notice ? (
              <p className="plan-chip" role="status">
                {notice}
              </p>
            ) : null}

            <section className="panel" aria-labelledby="doc-status-heading">
              <h2 id="doc-status-heading">{t(lang, 'manual.docTitle')}</h2>
              <p className="text-sm opacity-80">{t(lang, 'manual.docDisclaimer')}</p>
              <ul>
                <li>
                  {t(lang, 'manual.lastUpdated')}: {documentation?.lastUpdated || 'ΓÇö'}
                </li>
                <li>
                  {t(lang, 'manual.changelogSynced')}:{' '}
                  {documentation?.changelogSynced
                    ? t(lang, 'manual.syncYes')
                    : t(lang, 'manual.syncNo')}
                </li>
                <li>
                  {t(lang, 'manual.aiProvider')}: {documentation?.aiProvider || 'ΓÇö'}
                </li>
                {documentation?.summaryPreview ? (
                  <li>
                    {t(lang, 'manual.summaryPreview')}: {documentation.summaryPreview}
                  </li>
                ) : null}
              </ul>
              <div className="row-actions">
                <button
                  type="button"
                  className="primary"
                  onClick={() => void regenerateManual()}
                  disabled={manualBusy}
                >
                  {manualBusy ? t(lang, 'manual.regenerating') : t(lang, 'manual.regenerate')}
                </button>
                <a
                  className="secondary"
                  href="/docs/SYSTEM_MANUAL.md"
                  target="_blank"
                  rel="noreferrer"
                >
                  {t(lang, 'manual.viewTemplate')}
                </a>
              </div>
            </section>

            {health?.stripeAccount?.needsAttention ? (
              <section className="panel" role="alert" style={{ borderColor: '#ff6b6b' }}>
                <h2>{t(lang, 'heal.kycTitle')}</h2>
                <p>{t(lang, 'heal.kycBody')}</p>
                <ul>
                  <li>
                    {t(lang, 'heal.kycPayouts')}:{' '}
                    {health.stripeAccount.payoutsEnabled
                      ? t(lang, 'heal.kycYes')
                      : t(lang, 'heal.kycNo')}
                  </li>
                  <li>
                    {t(lang, 'heal.kycPending')}:{' '}
                    {health.stripeAccount.kycPending
                      ? t(lang, 'heal.kycYes')
                      : t(lang, 'heal.kycNo')}
                  </li>
                  <li>
                    {t(lang, 'heal.kycDue')}: {health.stripeAccount.currentlyDueCount ?? 0} /{' '}
                    {t(lang, 'heal.kycPastDue')}: {health.stripeAccount.pastDueCount ?? 0}
                  </li>
                  {health.stripeAccount.disabledReason ? (
                    <li>
                      {t(lang, 'heal.kycDisabled')}: {health.stripeAccount.disabledReason}
                    </li>
                  ) : null}
                  <li>
                    {t(lang, 'heal.updated')}: {health.stripeAccount.checkedAt || '╬ô├ç├╢'}
                  </li>
                </ul>
                <p className="text-sm opacity-80">{t(lang, 'heal.kycHint')}</p>
              </section>
            ) : null}

            <section className="panel">
              <h2>{t(lang, 'heal.scoreTitle')}</h2>
              <p
                style={{
                  fontSize: '2.5rem',
                  fontWeight: 800,
                  color: scoreColor(health?.score),
                  margin: '8px 0',
                }}
              >
                {health?.score ?? '╬ô├ç├╢'}
                <span style={{ fontSize: '1rem', marginLeft: 12, opacity: 0.85 }}>
                  {health?.status || t(lang, 'heal.statusUnknown')}
                </span>
              </p>
              <p className="opacity-80 text-sm">
                {t(lang, 'heal.updated')}: {health?.updatedAt || '╬ô├ç├╢'} Γö¼Γòû{' '}
                {health?.cycleId || ''}
              </p>
              <p>
                {t(lang, 'heal.guardian')}:{' '}
                {health?.lastGuardian?.passed
                  ? t(lang, 'heal.guardianPass')
                  : t(lang, 'heal.guardianFail')}
              </p>
              {health?.lastGuardian?.checks?.expectedCheckoutPrefix ? (
                <p className="text-sm opacity-70">
                  {t(lang, 'heal.checkoutPrefix')}:{' '}
                  {String(health.lastGuardian.checks.expectedCheckoutPrefix)}
                </p>
              ) : null}
            </section>

            <section className="panel">
              <h2>{t(lang, 'heal.activeTitle')}</h2>
              {(health?.activeRemediations || []).length ? (
                <ul>
                  {(health?.activeRemediations || []).map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              ) : (
                <p className="opacity-70">{t(lang, 'heal.noneActive')}</p>
              )}
            </section>

            <section className="panel">
              <h2>{t(lang, 'heal.circuitTitle')}</h2>
              {circuitBreakers.length ? (
                <ul>
                  {circuitBreakers.map((c) => (
                    <li key={String(c.id || c.errorType)}>
                      <strong>{String(c.errorType || c.id)}</strong> ╬ô├ç├╢{' '}
                      {t(lang, 'heal.circuitPaused')}
                      {c.countInWindow != null ? ` (${String(c.countInWindow)} hits)` : ''}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="opacity-70">{t(lang, 'heal.circuitNone')}</p>
              )}
            </section>

            <section className="panel">
              <h2>{t(lang, 'heal.firstTimeTitle')}</h2>
              <p>
                {t(lang, 'heal.firstTimeRate')}:{' '}
                {firstTimeStats?.successRate != null ? `${firstTimeStats.successRate}%` : '╬ô├ç├╢'}{' '}
                ({String(firstTimeStats?.remediated ?? 0)}/{String(firstTimeStats?.attempted ?? 0)})
              </p>
            </section>

            <section className="panel">
              <h2>{t(lang, 'heal.rollbackTitle')}</h2>
              {rollbackHistory.length ? (
                <ul>
                  {rollbackHistory.slice(0, 12).map((r) => (
                    <li key={String(r.id)}>
                      {String(r.createdAt || '')} ╬ô├ç├╢ {String(r.actionId || '')} ╬ô├ç├╢{' '}
                      {String(r.status || '')}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="opacity-70">{t(lang, 'heal.rollbackNone')}</p>
              )}
            </section>

            <section className="panel">
              <h2>{t(lang, 'heal.findingsTitle')}</h2>
              {(health?.findings || []).length ? (
                <ul>
                  {(health?.findings || []).map((f, i) => (
                    <li key={`${f.code}-${i}`}>
                      <strong>{f.severity || 'info'}</strong> ╬ô├ç├╢{' '}
                      {f.rcaKey ? t(lang, f.rcaKey) : f.code}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="opacity-70">{t(lang, 'heal.noFindings')}</p>
              )}
            </section>

            <section className="panel">
              <h2>{t(lang, 'heal.approvalsTitle')}</h2>
              {pending.length ? (
                <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 12 }}>
                  {pending.map((a) => (
                    <li
                      key={String(a.id)}
                      style={{ borderBottom: '1px solid rgba(212,175,55,0.2)', paddingBottom: 10 }}
                    >
                      <div>
                        <strong>{String(a.actionId || a.id)}</strong>
                        <p className="text-sm opacity-80">{String(a.reason || '')}</p>
                      </div>
                      <div className="row-actions">
                        <button
                          type="button"
                          className="primary"
                          onClick={() => void decide(String(a.id), 'approve')}
                        >
                          {t(lang, 'heal.approve')}
                        </button>
                        <button
                          type="button"
                          className="secondary"
                          onClick={() => void decide(String(a.id), 'reject')}
                        >
                          {t(lang, 'heal.reject')}
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="opacity-70">{t(lang, 'heal.noApprovals')}</p>
              )}
            </section>

            <section className="panel">
              <h2>{t(lang, 'heal.incidentsTitle')}</h2>
              {incidents.length ? (
                <ul>
                  {incidents.slice(0, 12).map((inc) => (
                    <li key={String(inc.id)}>
                      {String(inc.createdAt || '')} ╬ô├ç├╢ score {String(inc.score ?? '╬ô├ç├╢')} (
                      {String(inc.status || '')})
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="opacity-70">{t(lang, 'heal.noIncidents')}</p>
              )}
            </section>

            <section className="panel">
              <h2>{t(lang, 'heal.notificationsTitle')}</h2>
              {notifications.length ? (
                <ul>
                  {notifications.slice(0, 12).map((n) => (
                    <li key={String(n.id)}>
                      {String(n.createdAt || n.lastSentAt || '')} ╬ô├ç├╢{' '}
                      {String(n.type || n.key || n.id)}
                      {n.score != null ? ` (score ${String(n.score)})` : ''}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="opacity-70">{t(lang, 'heal.noNotifications')}</p>
              )}
            </section>

            <section className="panel">
              <h2>{t(lang, 'heal.remediationsTitle')}</h2>
              {remediations.length ? (
                <ul>
                  {remediations.slice(0, 12).map((r) => (
                    <li key={String(r.id)}>
                      {String(r.actionId || '')} ╬ô├ç├╢ {String(r.status || '')} (
                      {String(r.risk || '')})
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="opacity-70">{t(lang, 'heal.noRemediations')}</p>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
