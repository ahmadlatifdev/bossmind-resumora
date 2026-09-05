import { createContext, useContext, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Outlet } from 'react-router-dom';
import { t } from '../lib/i18n.js';
import {
  fetchMasterDashboard,
  readAdminPassword,
  writeAdminPassword,
  requestAdminPasswordReset,
  confirmAdminPasswordReset,
} from '../lib/adminApi';
import '../admin-master.css';

/** Master Admin is English-only (client site keeps EN/FR/ES). */
const ADMIN_LANG = 'en';

type AdminAuthValue = {
  lang: string;
  setLangCode: (code: string) => void;
  password: string;
  unlocked: boolean;
};

const AdminAuthContext = createContext<AdminAuthValue | null>(null);

export function useAdminAuth() {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error('useAdminAuth requires AdminAuthGate');
  return ctx;
}

export default function AdminAuthGate() {
  const lang = ADMIN_LANG;
  const [password, setPassword] = useState(() => readAdminPassword());
  const [unlocked, setUnlocked] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'login' | 'reset'>('login');
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const setLangCode = (_code: string) => {
    /* Admin UI locked to English */
  };

  useEffect(() => {
    const pw = readAdminPassword();
    if (!pw) return;
    let cancelled = false;
    setBusy(true);
    fetchMasterDashboard(pw)
      .then(() => {
        if (cancelled) return;
        setPassword(pw);
        setUnlocked(true);
      })
      .catch(() => {
        if (cancelled) return;
        writeAdminPassword('');
        setUnlocked(false);
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function onUnlock(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    const pw = password.trim();
    try {
      await fetchMasterDashboard(pw);
      writeAdminPassword(pw);
      setPassword(pw);
      setUnlocked(true);
    } catch (err) {
      writeAdminPassword('');
      setUnlocked(false);
      const status = (err as Error & { statusCode?: number }).statusCode;
      setError(
        status === 401 || status === 403
          ? t(lang, 'master.unauthorized')
          : err instanceof Error
            ? err.message
            : t(lang, 'master.unlockFailed')
      );
    } finally {
      setBusy(false);
    }
  }

  async function onRequestReset(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const out = await requestAdminPasswordReset();
      setNotice(String(out.hint || t(lang, 'master.resetCodeSent')));
    } catch (err) {
      setError(err instanceof Error ? err.message : t(lang, 'master.resetRequestFailed'));
    } finally {
      setBusy(false);
    }
  }

  async function onConfirmReset(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    if (newPassword !== confirmPassword) {
      setError(t(lang, 'master.resetMismatch'));
      setBusy(false);
      return;
    }
    try {
      await confirmAdminPasswordReset(resetCode.trim(), newPassword);
      writeAdminPassword(newPassword);
      setPassword(newPassword);
      setNotice(t(lang, 'master.resetSuccess'));
      setMode('login');
      setResetCode('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : t(lang, 'master.resetConfirmFailed'));
    } finally {
      setBusy(false);
    }
  }

  const value = useMemo(
    () => ({ lang: ADMIN_LANG, setLangCode, password, unlocked }),
    [password, unlocked]
  );

  if (!unlocked) {
    return (
      <div className="admin-master admin-master--gate">
        <header className="admin-master__top">
          <p className="admin-master__brand">{t(lang, 'master.brand')}</p>
        </header>
        <main className="admin-master__gate-main">
          {mode === 'login' ? (
            <form className="admin-master__card" onSubmit={onUnlock}>
              <h1>{t(lang, 'master.lockTitle')}</h1>
              <p className="admin-master__lead">{t(lang, 'master.lockLead')}</p>
              <label>
                {t(lang, 'heal.adminPassword')}
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </label>
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
              <button type="submit" className="admin-master__btn" disabled={busy}>
                {busy ? t(lang, 'master.unlocking') : t(lang, 'heal.unlock')}
              </button>
              <button
                type="button"
                className="admin-master__link-btn"
                onClick={() => {
                  setMode('reset');
                  setError('');
                  setNotice('');
                }}
              >
                {t(lang, 'master.forgotPassword')}
              </button>
            </form>
          ) : (
            <div className="admin-master__card">
              <h1>{t(lang, 'master.resetTitle')}</h1>
              <p className="admin-master__lead">{t(lang, 'master.resetLead')}</p>
              <form onSubmit={onRequestReset}>
                <button type="submit" className="admin-master__btn" disabled={busy}>
                  {busy ? t(lang, 'master.unlocking') : t(lang, 'master.resetSendCode')}
                </button>
              </form>
              <form onSubmit={onConfirmReset} style={{ marginTop: 16 }}>
                <label>
                  {t(lang, 'master.resetCode')}
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={resetCode}
                    onChange={(e) => setResetCode(e.target.value)}
                    required
                  />
                </label>
                <label>
                  {t(lang, 'master.resetNewPassword')}
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    minLength={12}
                    required
                  />
                </label>
                <label>
                  {t(lang, 'master.resetConfirmPassword')}
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    minLength={12}
                    required
                  />
                </label>
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
                <button type="submit" className="admin-master__btn" disabled={busy}>
                  {t(lang, 'master.resetConfirm')}
                </button>
              </form>
              <button
                type="button"
                className="admin-master__link-btn"
                onClick={() => {
                  setMode('login');
                  setError('');
                  setNotice('');
                }}
              >
                {t(lang, 'master.backToLogin')}
              </button>
            </div>
          )}
        </main>
      </div>
    );
  }

  return (
    <AdminAuthContext.Provider value={value}>
      <Outlet />
    </AdminAuthContext.Provider>
  );
}
