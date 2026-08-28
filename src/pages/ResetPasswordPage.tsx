import { useEffect, useMemo, useState, type FormEvent } from 'react';
import SiteHeader from '../components/SiteHeader';
import { getLang, normalizeLang, setLang, t } from '../lib/i18n.js';
import {
  completePasswordReset,
  isStrongPassword,
  peekResetEmail,
  readResetOobFromLocation,
  requestPasswordResetEmail,
} from '../lib/passwordReset.js';

function authCode(err: unknown): string {
  if (err && typeof err === 'object' && 'code' in err) {
    return String((err as { code?: string }).code || '');
  }
  return '';
}

/**
 * Dedicated password reset page:
 * - Request reset email (enumeration-safe)
 * - If Firebase action URL lands here with oobCode → set a strong new password
 */
export default function ResetPasswordPage() {
  const [lang, setLangState] = useState(() => getLang());
  const [emailLang, setEmailLang] = useState(() => getLang());
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [oobEmail, setOobEmail] = useState('');
  const oobCode = useMemo(
    () => readResetOobFromLocation(typeof window !== 'undefined' ? window.location.search : ''),
    []
  );
  const isConfirmMode = Boolean(oobCode);

  function switchLang(next: string) {
    const code = setLang(next);
    setLangState(code);
    setEmailLang(code);
  }

  useEffect(() => {
    if (!oobCode) return;
    let cancelled = false;
    (async () => {
      try {
        const accountEmail = await peekResetEmail(oobCode);
        if (!cancelled) setOobEmail(accountEmail);
      } catch {
        if (!cancelled) setError(t(lang, 'auth.resetLinkInvalid'));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [oobCode, lang]);

  async function onRequestReset(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setStatus('');
    try {
      await requestPasswordResetEmail(email.trim(), normalizeLang(emailLang));
      setStatus(t(lang, 'auth.resetSuccess'));
    } catch (err) {
      const code = authCode(err);
      if (code === 'resumora/rate-limited') {
        const sec =
          err && typeof err === 'object' && 'retryAfterSec' in err
            ? Number((err as { retryAfterSec?: number }).retryAfterSec) || 60
            : 60;
        setError(t(lang, 'auth.resetRateLimited').replace('{seconds}', String(sec)));
      } else if (code === 'auth/configuration-not-found' || code === 'auth/operation-not-allowed') {
        setError(t(lang, 'auth.resetUnavailable'));
      } else if (code === 'auth/unauthorized-domain') {
        setError(t(lang, 'auth.unauthorizedDomain'));
      } else {
        // Still show success-style generic for other client errors to avoid enumeration.
        setStatus(t(lang, 'auth.resetSuccess'));
      }
    } finally {
      setBusy(false);
    }
  }

  async function onConfirmNewPassword(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setStatus('');
    if (password !== confirm) {
      setError(t(lang, 'auth.passwordMismatch'));
      setBusy(false);
      return;
    }
    if (!isStrongPassword(password)) {
      setError(t(lang, 'auth.passwordWeak'));
      setBusy(false);
      return;
    }
    try {
      await completePasswordReset(oobCode, password);
      setStatus(t(lang, 'auth.resetComplete'));
      window.setTimeout(() => {
        window.location.assign('https://resumora.net/login?mode=forgot');
      }, 1200);
    } catch (err) {
      const code = authCode(err);
      if (code === 'resumora/weak-password') {
        setError(t(lang, 'auth.passwordWeak'));
      } else if (code === 'auth/expired-action-code' || code === 'auth/invalid-action-code') {
        setError(t(lang, 'auth.resetLinkInvalid'));
      } else {
        setError(t(lang, 'auth.resetGeneric'));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app-shell">
      <SiteHeader lang={lang} onLangChange={switchLang} currentPath="/reset-password" />

      <main className="app-main narrow">
        <h1>{t(lang, 'reset.title')}</h1>
        <p className="lead">
          {isConfirmMode ? t(lang, 'auth.setNewPasswordLead') : t(lang, 'auth.resetLead')}
        </p>

        {isConfirmMode ? (
          <form className="panel" onSubmit={onConfirmNewPassword}>
            {oobEmail ? (
              <p className="muted small">
                {t(lang, 'auth.resetForEmail')}: <strong>{oobEmail}</strong>
              </p>
            ) : null}
            <label>
              {t(lang, 'auth.newPassword')}
              <input
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <label>
              {t(lang, 'auth.confirmPassword')}
              <input
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </label>
            <p className="muted small">{t(lang, 'auth.passwordPolicy')}</p>
            <button className="primary" type="submit" disabled={busy}>
              {busy ? t(lang, 'auth.savingPassword') : t(lang, 'auth.saveNewPassword')}
            </button>
          </form>
        ) : (
          <form className="panel" onSubmit={onRequestReset} noValidate>
            <label>
              {t(lang, 'auth.emailLangLabel')}
              <select
                value={emailLang}
                onChange={(e) => setEmailLang(normalizeLang(e.target.value))}
                aria-label={t(lang, 'auth.emailLangLabel')}
              >
                <option value="en">{t(lang, 'auth.langOptionEn')}</option>
                <option value="fr">{t(lang, 'auth.langOptionFr')}</option>
                <option value="es">{t(lang, 'auth.langOptionEs')}</option>
              </select>
            </label>
            <label>
              {t(lang, 'auth.email')}
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <p className="muted small">{t(lang, 'auth.resetPrivacy')}</p>
            <div id="recaptcha-container" aria-hidden="true" />
            <button className="primary" type="submit" disabled={busy}>
              {busy ? t(lang, 'auth.sendingReset') : t(lang, 'auth.sendReset')}
            </button>
            <p className="muted small">
              <a href="/login">{t(lang, 'auth.backToSignIn')}</a>
            </p>
          </form>
        )}

        {status ? (
          <p className="banner ok" role="status">
            {status}
          </p>
        ) : null}
        {error ? (
          <p className="banner err" role="alert">
            {error}
          </p>
        ) : null}
      </main>
    </div>
  );
}
