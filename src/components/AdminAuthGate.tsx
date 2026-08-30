import { createContext, useContext, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Outlet } from 'react-router-dom';
import LanguageSwitcher from './LanguageSwitcher';
import { getLang, setLang, t } from '../lib/i18n.js';
import { fetchMasterDashboard, readAdminPassword, writeAdminPassword } from '../lib/adminApi';
import '../admin-master.css';

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
  const [lang, setLangState] = useState(() => getLang());
  const [password, setPassword] = useState(() => readAdminPassword());
  const [unlocked, setUnlocked] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const setLangCode = (code: string) => setLangState(setLang(code));

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

  const value = useMemo(
    () => ({ lang, setLangCode, password, unlocked }),
    [lang, password, unlocked]
  );

  if (!unlocked) {
    return (
      <div className="admin-master admin-master--gate">
        <header className="admin-master__top">
          <p className="admin-master__brand">{t(lang, 'master.brand')}</p>
          <LanguageSwitcher lang={lang} onChange={setLangCode} />
        </header>
        <main className="admin-master__gate-main">
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
            <button type="submit" className="admin-master__btn" disabled={busy}>
              {busy ? t(lang, 'master.unlocking') : t(lang, 'heal.unlock')}
            </button>
          </form>
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
