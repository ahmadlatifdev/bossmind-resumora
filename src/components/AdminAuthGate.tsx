import { createContext, useContext, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Outlet } from 'react-router-dom';
import { t } from '../lib/i18n.js';
import {
  fetchMasterDashboard,
  fetchOwnerProjects,
  readAdminPassword,
  writeAdminPassword,
  readOwnerMode,
  writeOwnerMode,
  readOwnerPassword,
  writeOwnerPassword,
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
  ownerMode: boolean;
  ownerPassword: string;
  enableOwnerMode: (ownerPw: string) => Promise<void>;
  disableOwnerMode: () => void;
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
  const [ownerMode, setOwnerMode] = useState(() => readOwnerMode());
  const [ownerPassword, setOwnerPassword] = useState(() => readOwnerPassword());
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
        writeOwnerMode(false);
        writeOwnerPassword('');
        setOwnerMode(false);
        setOwnerPassword('');
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

  async function enableOwnerMode(ownerPw: string) {
    const pw = String(ownerPw || '').trim();
    if (!pw) throw new Error(t(lang, 'master.ownerPasswordRequired'));
    await fetchOwnerProjects(pw);
    writeOwnerPassword(pw);
    writeOwnerMode(true);
    setOwnerPassword(pw);
    setOwnerMode(true);
  }

  function disableOwnerMode() {
    writeOwnerMode(false);
    writeOwnerPassword('');
    setOwnerMode(false);
    setOwnerPassword('');
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
    () => ({
      lang: ADMIN_LANG,
      setLangCode,
      password,
      unlocked,
      ownerMode,
      ownerPassword,
      enableOwnerMode,
      disableOwnerMode,
    }),
    [password, unlocked, ownerMode, ownerPassword]
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
              {error ? <p className="admin-master__error">{error}</p> : null}
              {notice ? <p className="admin-master__notice">{notice}</p> : null}
              <button type="submit" className="admin-master__btn" disabled={busy}>
                {busy ? t(lang, 'master.unlocking') : t(lang, 'heal.unlock')}
              </button>
              <button
                type="button"
                className="admin-master__btn admin-master__btn--ghost"
                disabled={busy}
                onClick={() => {
                  setMode('reset');
                  setError('');
                  setNotice('');
                }}
              >
                {busy ? t(lang, 'master.unlocking') : t(lang, 'master.resetSendCode')}
              </button>
            </form>
          ) : (
            <form className="admin-master__card" onSubmit={onConfirmReset}>
              <h1>{t(lang, 'master.resetTitle')}</h1>
              <p className="admin-master__lead">{t(lang, 'master.resetLead')}</p>
              <button
                type="button"
                className="admin-master__btn admin-master__btn--ghost"
                disabled={busy}
                onClick={(e) => void onRequestReset(e)}
              >
                {t(lang, 'master.resetSendCode')}
              </button>
              <label>
                {t(lang, 'master.resetCode')}
                <input
                  type="text"
                  inputMode="numeric"
                  value={resetCode}
                  onChange={(e) => setResetCode(e.target.value)}
                  required
                />
              </label>
              <label>
                {t(lang, 'master.resetNewPassword')}
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                />
              </label>
              <label>
                {t(lang, 'master.resetConfirmPassword')}
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                />
              </label>
              {error ? <p className="admin-master__error">{error}</p> : null}
              {notice ? <p className="admin-master__notice">{notice}</p> : null}
              <button type="submit" className="admin-master__btn" disabled={busy}>
                {t(lang, 'master.resetConfirm')}
              </button>
              <button
                type="button"
                className="admin-master__btn admin-master__btn--ghost"
                onClick={() => {
                  setMode('login');
                  setError('');
                  setNotice('');
                }}
              >
                {t(lang, 'master.resetBack')}
              </button>
            </form>
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
