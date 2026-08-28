import { useCallback, useEffect, useState, type FormEvent } from 'react';
import BrandLogo from '../components/BrandLogo';
import LanguageSwitcher from '../components/LanguageSwitcher';
import { getLang, setLang, t } from '../lib/i18n.js';
import '../app-shell.css';

const HEALTH_URL = '/api/admin/system-health';
const RUN_URL = '/api/admin/system-health/run';
const DECIDE_URL = '/api/admin/system-health/decide';
const SESSION_KEY = 'resumora_admin_heal_pw';

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
  const [lang, setLangState] = useState(() => getLang());
  const [password, setPassword] = useState(() => sessionStorage.getItem(SESSION_KEY) || '');
  const [unlocked, setUnlocked] = useState(() => Boolean(sessionStorage.getItem(SESSION_KEY)));
  const [health, setHealth] = useState<HealthDoc | null>(null);
  const [incidents, setIncidents] = useState<Array<Record<string, unknown>>>([]);
  const [remediations, setRemediations] = useState<Array<Record<string, unknown>>>([]);
  const [pending, setPending] = useState<Array<Record<string, unknown>>>([]);
  const [notifications, setNotifications] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const onLang = (code: string) => setLangState(setLang(code));

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
          .replace('{score}', String(data.score ?? '—'))
          .replace('{status}', String(data.status ?? '—'))
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

  return (
    <div className="app-shell">
      <header
        className="app-header site-header site-header--logo-lang-only"
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
      >
        <a href="/" className="site-logo" aria-label="RESUMORA.NET">
          <BrandLogo decorative />
        </a>
        <LanguageSwitcher lang={lang} onChange={onLang} />
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
                    {t(lang, 'heal.updated')}: {health.stripeAccount.checkedAt || '—'}
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
                {health?.score ?? '—'}
                <span style={{ fontSize: '1rem', marginLeft: 12, opacity: 0.85 }}>
                  {health?.status || t(lang, 'heal.statusUnknown')}
                </span>
              </p>
              <p className="opacity-80 text-sm">
                {t(lang, 'heal.updated')}: {health?.updatedAt || '—'} · {health?.cycleId || ''}
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
              <h2>{t(lang, 'heal.findingsTitle')}</h2>
              {(health?.findings || []).length ? (
                <ul>
                  {(health?.findings || []).map((f, i) => (
                    <li key={`${f.code}-${i}`}>
                      <strong>{f.severity || 'info'}</strong> —{' '}
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
                      {String(inc.createdAt || '')} — score {String(inc.score ?? '—')} (
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
                      {String(n.createdAt || n.lastSentAt || '')} —{' '}
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
                      {String(r.actionId || '')} — {String(r.status || '')} ({String(r.risk || '')})
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
