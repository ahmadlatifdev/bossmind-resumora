import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useAdminAuth } from '../components/AdminAuthGate';
import {
  brocAutofixHint,
  brocLocalBackup,
  fetchBrocStatus,
  postBrocAction,
  probeHermesLocalHealth,
  type MasterProject,
} from '../lib/adminApi';
import { t } from '../lib/i18n.js';

type DiagCheck = { id?: string; label?: string; ok?: boolean | null; detail?: string };
type BackupRow = {
  id?: string;
  createdAt?: string | null;
  actor?: string | null;
  projectCount?: number;
  git?: unknown;
};

/**
 * BossMind Resilience & Operations Center (BRoC) — War Room.
 * L1: AdminAuthGate (VITE_ADMIN_PASSWORD / unlock). L2: ADMIN_REFUND_PASSWORD APIs.
 * L3: Hard Lock re-entry for Safe Mode / Resume.
 */
export default function AdminMissionControlPage() {
  const { lang, password, ownerPassword, ownerMode, enableOwnerMode } = useAdminAuth();
  const apiPw = ownerPassword || password;

  const [status, setStatus] = useState<{
    quarantineActive?: boolean;
    averageHealth?: number | null;
    projects?: MasterProject[];
    backupLog?: BackupRow[];
    globalHealth?: { score?: number | null; status?: string | null };
    healthyRevision?: { revisionId?: string | null; service?: string | null };
  } | null>(null);
  const [hermesUp, setHermesUp] = useState(false);
  const [diag, setDiag] = useState<{ checks?: DiagCheck[]; message?: string; ok?: boolean } | null>(
    null
  );
  const [logs, setLogs] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');
  const [hardLockPw, setHardLockPw] = useState('');
  const [showHardLock, setShowHardLock] = useState<'safe-mode' | 'resume' | null>(null);
  const [level2Ready, setLevel2Ready] = useState(false);

  function pushLog(line: string) {
    const stamp = new Date().toISOString().slice(11, 19);
    setLogs((prev) => [`[${stamp}] ${line}`, ...prev].slice(0, 40));
  }

  const refresh = useCallback(
    async (quiet = false) => {
      if (!apiPw) {
        setLevel2Ready(false);
        return;
      }
      try {
        const [st, hermes] = await Promise.all([fetchBrocStatus(apiPw), probeHermesLocalHealth()]);
        setStatus(st);
        setHermesUp(hermes);
        setLevel2Ready(true);
        setError('');
        if (!quiet) pushLog('Global health dashboard refreshed');
      } catch (err) {
        setLevel2Ready(false);
        if (!quiet) {
          setError(err instanceof Error ? err.message : t(lang, 'broc.loadFailed'));
        }
      }
    },
    [apiPw, lang]
  );

  useEffect(() => {
    void refresh(true);
    const id = window.setInterval(() => {
      void refresh(true);
      void probeHermesLocalHealth().then(setHermesUp);
    }, 10000);
    return () => window.clearInterval(id);
  }, [refresh]);

  async function ensureLevel2() {
    if (ownerMode && ownerPassword) return ownerPassword;
    if (!apiPw) throw new Error(t(lang, 'broc.needOwner'));
    // Promote session with same unlock password when it matches ADMIN_REFUND_PASSWORD.
    try {
      await enableOwnerMode(apiPw);
    } catch {
      /* continue with apiPw for BRoC assertOwnerAccess */
    }
    return apiPw;
  }

  async function onDiagnostics() {
    setBusy('diagnostics');
    setError('');
    try {
      const pw = await ensureLevel2();
      const hermes = await probeHermesLocalHealth();
      setHermesUp(hermes);
      const out = (await postBrocAction(pw, 'diagnostics', {
        hermesLocal: { ok: hermes, detail: hermes ? 'HITL/MCP reachable' : 'unreachable' },
      })) as { checks?: DiagCheck[]; message?: string; ok?: boolean };
      setDiag(out);
      pushLog(String(out.message || 'Diagnostics complete'));
      setNotice(String(out.message || t(lang, 'broc.diagOk')));
      await refresh(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t(lang, 'broc.diagFailed'));
    } finally {
      setBusy('');
    }
  }

  async function onAutoRecover() {
    setBusy('recover');
    setError('');
    try {
      const pw = await ensureLevel2();
      const out = await postBrocAction(pw, 'auto-recover', {});
      pushLog(String(out.message || 'Auto-recover ran'));
      setNotice(String(out.message || t(lang, 'broc.recoverOk')));
      const hermes = await probeHermesLocalHealth();
      setHermesUp(hermes);
      if (!hermes) {
        const hint = await brocAutofixHint();
        pushLog(String(hint.message || hint.command || 'npm run dev:all'));
        setNotice(
          `${String(out.message || '')} — Local Hermes down: run \`${hint.command || 'npm run dev:all'}\`.`
        );
      }
      await refresh(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t(lang, 'broc.recoverFailed'));
    } finally {
      setBusy('');
    }
  }

  async function onAutofix() {
    setBusy('autofix');
    setError('');
    try {
      const hint = await brocAutofixHint();
      pushLog(`Auto-Fix: ${hint.command || 'npm run dev:all'}`);
      setNotice(String(hint.message || t(lang, 'broc.autofixHint')));
      const hermes = await probeHermesLocalHealth();
      setHermesUp(hermes);
    } catch (err) {
      setError(err instanceof Error ? err.message : t(lang, 'broc.autofixFailed'));
    } finally {
      setBusy('');
    }
  }

  async function onBackup() {
    setBusy('backup');
    setError('');
    try {
      const pw = await ensureLevel2();
      let git: Record<string, unknown> | null = null;
      try {
        git = (await brocLocalBackup(false)) as Record<string, unknown>;
        pushLog(`Local git status: ${String(git.message || 'ok')}`);
      } catch {
        git = { status: 'local_hermes_offline' };
        pushLog('Local git helper offline — cloud snapshot only');
      }
      const out = await postBrocAction(pw, 'backup', { git });
      pushLog(String(out.message || `Backup ${out.backupId || 'saved'}`));
      setNotice(String(out.message || t(lang, 'broc.backupOk')));
      await refresh(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t(lang, 'broc.backupFailed'));
    } finally {
      setBusy('');
    }
  }

  async function onHardLockSubmit(e: FormEvent) {
    e.preventDefault();
    if (!showHardLock) return;
    setBusy(showHardLock);
    setError('');
    try {
      const pw = await ensureLevel2();
      const action = showHardLock === 'safe-mode' ? 'safe-mode' : 'resume';
      const out = await postBrocAction(pw, action, {
        confirmPassword: hardLockPw,
        reason: 'BRoC Mission Control panic / resume',
      });
      pushLog(String(out.message || action));
      setNotice(String(out.message || t(lang, 'broc.safeModeOk')));
      setHardLockPw('');
      setShowHardLock(null);
      await refresh(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t(lang, 'broc.hardLockFailed'));
    } finally {
      setBusy('');
    }
  }

  const projects = status?.projects || [];
  const score = status?.globalHealth?.score ?? status?.averageHealth ?? null;
  const quarantine = Boolean(status?.quarantineActive);

  return (
    <div className="broc-war-room">
      <header className="broc-war-room__hero">
        <div>
          <p className="broc-war-room__eyebrow">{t(lang, 'broc.eyebrow')}</p>
          <h2 className="broc-war-room__title">{t(lang, 'broc.title')}</h2>
          <p className="broc-war-room__lead">{t(lang, 'broc.lead')}</p>
        </div>
        <div className="broc-security-gates" aria-label={t(lang, 'broc.gatesAria')}>
          <span className={`broc-gate broc-gate--on`}>L1 UI</span>
          <span className={`broc-gate${level2Ready ? ' broc-gate--on' : ''}`}>L2 API</span>
          <span className={`broc-gate${ownerMode ? ' broc-gate--on' : ''}`}>L3 Owner</span>
        </div>
      </header>

      {!level2Ready ? (
        <p className="admin-master__alert" role="status">
          {t(lang, 'broc.needOwner')}
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

      <section className="broc-panel broc-panel--health" aria-label={t(lang, 'broc.healthAria')}>
        <div className="broc-panel__head">
          <h3>{t(lang, 'broc.healthTitle')}</h3>
          <button
            type="button"
            className="admin-master__btn admin-master__btn--ghost"
            disabled={Boolean(busy)}
            onClick={() => void refresh(false)}
          >
            {t(lang, 'broc.refresh')}
          </button>
        </div>
        <div className="broc-metrics">
          <div className="broc-metric">
            <span className="broc-metric__label">{t(lang, 'broc.globalScore')}</span>
            <strong className="broc-metric__value">
              {score != null ? `${score}` : t(lang, 'master.metricNa')}
            </strong>
          </div>
          <div className="broc-metric">
            <span className="broc-metric__label">{t(lang, 'broc.hermes')}</span>
            <strong className={`broc-metric__value${hermesUp ? ' is-ok' : ' is-bad'}`}>
              {hermesUp ? t(lang, 'broc.online') : t(lang, 'broc.offline')}
            </strong>
          </div>
          <div className="broc-metric">
            <span className="broc-metric__label">{t(lang, 'broc.safeMode')}</span>
            <strong className={`broc-metric__value${quarantine ? ' is-warn' : ' is-ok'}`}>
              {quarantine ? t(lang, 'broc.quarantineOn') : t(lang, 'broc.quarantineOff')}
            </strong>
          </div>
          <div className="broc-metric">
            <span className="broc-metric__label">{t(lang, 'broc.healthyRevision')}</span>
            <strong className="broc-metric__value">
              {status?.healthyRevision?.revisionId
                ? String(status.healthyRevision.revisionId).slice(0, 28)
                : t(lang, 'master.metricNa')}
            </strong>
          </div>
        </div>
        <ul className="broc-project-grid">
          {projects.map((p) => (
            <li
              key={p.projectId}
              className={`broc-project-card${p.quarantine || p.readOnly ? ' is-quarantine' : ''}`}
            >
              <strong>{p.name || p.projectId}</strong>
              <span>{p.status || '—'}</span>
              <span>
                {p.healthScore != null ? `${p.healthScore}%` : t(lang, 'master.metricNa')}
              </span>
              {(p.quarantine || p.readOnly) && (
                <em className="broc-project-card__flag">{t(lang, 'broc.readOnly')}</em>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="broc-panel" aria-label={t(lang, 'broc.actionsAria')}>
        <h3>{t(lang, 'broc.actionsTitle')}</h3>
        <div className="broc-actions">
          <button
            type="button"
            className="admin-master__btn"
            disabled={Boolean(busy) || !apiPw}
            onClick={() => void onDiagnostics()}
          >
            {busy === 'diagnostics' ? t(lang, 'broc.working') : t(lang, 'broc.runDiagnostics')}
          </button>
          <button
            type="button"
            className="admin-master__btn"
            disabled={Boolean(busy) || !apiPw || quarantine}
            onClick={() => void onAutoRecover()}
          >
            {busy === 'recover' ? t(lang, 'broc.working') : t(lang, 'broc.autoRecover')}
          </button>
          <button
            type="button"
            className="admin-master__btn admin-master__btn--ghost"
            disabled={Boolean(busy)}
            onClick={() => void onAutofix()}
          >
            {busy === 'autofix' ? t(lang, 'broc.working') : t(lang, 'broc.autoFix')}
          </button>
          <button
            type="button"
            className="admin-master__btn admin-master__btn--ghost"
            disabled={Boolean(busy) || !apiPw}
            onClick={() => void onBackup()}
          >
            {busy === 'backup' ? t(lang, 'broc.working') : t(lang, 'broc.autoBackup')}
          </button>
          <button
            type="button"
            className="broc-panic"
            disabled={Boolean(busy) || !apiPw}
            onClick={() => setShowHardLock(quarantine ? 'resume' : 'safe-mode')}
          >
            {quarantine ? t(lang, 'broc.resume') : t(lang, 'broc.enterSafeMode')}
          </button>
        </div>
        <p className="admin-master__lead">{t(lang, 'broc.zeroLoss')}</p>
      </section>

      {showHardLock ? (
        <form className="broc-hard-lock" onSubmit={onHardLockSubmit}>
          <h3>{t(lang, 'broc.hardLockTitle')}</h3>
          <p className="admin-master__lead">
            {showHardLock === 'safe-mode'
              ? t(lang, 'broc.hardLockSafeMode')
              : t(lang, 'broc.hardLockResume')}
          </p>
          <label>
            {t(lang, 'broc.hardLockLabel')}
            <input
              type="password"
              value={hardLockPw}
              onChange={(e) => setHardLockPw(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          <div className="broc-hard-lock__actions">
            <button type="submit" className="broc-panic" disabled={Boolean(busy)}>
              {busy ? t(lang, 'broc.working') : t(lang, 'broc.hardLockConfirm')}
            </button>
            <button
              type="button"
              className="admin-master__btn admin-master__btn--ghost"
              disabled={Boolean(busy)}
              onClick={() => {
                setShowHardLock(null);
                setHardLockPw('');
              }}
            >
              {t(lang, 'master.ownerCancel')}
            </button>
          </div>
        </form>
      ) : null}

      <div className="broc-split">
        <section className="broc-panel" aria-label={t(lang, 'broc.backupAria')}>
          <h3>{t(lang, 'broc.backupTitle')}</h3>
          {(status?.backupLog || []).length ? (
            <ul className="broc-backup-log">
              {(status?.backupLog || []).map((b) => (
                <li key={String(b.id)}>
                  <time>
                    {String(b.createdAt || '')
                      .slice(0, 19)
                      .replace('T', ' ')}
                  </time>
                  <span>
                    {b.projectCount ?? 0} projects · {String(b.actor || 'broc')}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="admin-master__lead">{t(lang, 'broc.backupEmpty')}</p>
          )}
        </section>

        <section className="broc-panel" aria-label={t(lang, 'broc.diagAria')}>
          <h3>{t(lang, 'broc.diagTitle')}</h3>
          {diag?.checks?.length ? (
            <ul className="broc-diag-list">
              {diag.checks.map((c) => (
                <li key={String(c.id || c.label)} className={c.ok === false ? 'is-bad' : 'is-ok'}>
                  <strong>{c.label}</strong>
                  <span>{c.detail}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="admin-master__lead">{t(lang, 'broc.diagEmpty')}</p>
          )}
        </section>
      </div>

      <section className="broc-panel" aria-label={t(lang, 'broc.opsLogAria')}>
        <h3>{t(lang, 'broc.opsLogTitle')}</h3>
        <pre className="broc-ops-log">
          {logs.length ? logs.join('\n') : t(lang, 'broc.opsLogEmpty')}
        </pre>
      </section>
    </div>
  );
}
