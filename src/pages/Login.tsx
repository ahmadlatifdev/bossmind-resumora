import { type FormEvent, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
} from 'firebase/auth';
import { auth, setAuthEmailLanguage } from '../lib/firebase';
import { requestEmailVerification, requestPasswordReset } from '../lib/authActions';
import { useLang } from '../i18n/LangContext';
import { t } from '../lib/i18n.js';

type AuthLang = 'en' | 'fr' | 'es';

/**
 * Password reset only sets Firebase Auth language for the email template.
 * Chrome (header, EN/FR/ES, footer) comes from AppLayout.
 */
export default function LoginPage() {
  const { lang, switchLang } = useLang();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const from =
    searchParams.get('from') ||
    (location.state as { from?: string } | null)?.from ||
    '/video-library';

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [showReset, setShowReset] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);

  const finish = () => navigate(from, { replace: true });

  const onLangSelect = (next: AuthLang) => {
    switchLang(next);
    setAuthEmailLanguage(next);
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setInfo('');
    setBusy(true);
    try {
      if (mode === 'login') {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      } else {
        const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
        await requestEmailVerification(credential.user);
      }
      finish();
    } catch (err) {
      if (mode === 'login') {
        setShowReset(true);
      }
      setError(err instanceof Error ? err.message : t(lang, 'auth.failed'));
    } finally {
      setBusy(false);
    }
  };

  const onGoogle = async () => {
    setError('');
    setInfo('');
    setBusy(true);
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
      finish();
    } catch (err) {
      setError(err instanceof Error ? err.message : t(lang, 'auth.googleFailed'));
    } finally {
      setBusy(false);
    }
  };

  const onForgotClick = () => {
    setError('');
    setInfo('');
    setShowReset(true);
  };

  const onSendReset = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setInfo('');
    const trimmed = email.trim();
    if (!trimmed) {
      setError(t(lang, 'auth.needEmail'));
      return;
    }
    setBusy(true);
    try {
      setAuthEmailLanguage(lang);
      await requestPasswordReset(trimmed);
      setInfo('If an account exists with that email, a reset link has been sent.');
    } catch (err) {
      const code =
        err && typeof err === 'object' && 'code' in err
          ? String((err as { code?: string }).code || '')
          : '';
      if (code === 'auth/configuration-not-found') {
        setError(t(lang, 'auth.resetUnavailable'));
      } else {
        setError(t(lang, 'auth.genericError'));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center px-4 py-16">
      <section className="v6-hero-panel max-w-md w-full flex flex-col gap-5">
        <h1 className="v6-heading text-3xl text-center">
          {mode === 'register' ? t(lang, 'auth.registerTitle') : t(lang, 'auth.memberTitle')}
        </h1>
        <p className="v6-subhead text-center opacity-80 text-sm">
          {mode === 'register' ? t(lang, 'auth.registerLead') : t(lang, 'auth.memberLead')}
        </p>

        {!showReset ? (
          <>
            <button
              type="button"
              className="v6-cta w-full py-3 rounded-full font-bold"
              onClick={onGoogle}
              disabled={busy}
            >
              {t(lang, 'auth.continueGoogle')}
            </button>

            <div className="text-center text-xs opacity-60 tracking-widest uppercase">
              {t(lang, 'auth.orEmail')}
            </div>

            <form className="flex flex-col gap-3" onSubmit={onSubmit}>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t(lang, 'auth.email')}
                className="w-full rounded-xl border border-[color:var(--color-gold)]/30 bg-transparent px-4 py-3"
                autoComplete="email"
              />
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t(lang, 'auth.password')}
                  className="w-full rounded-xl border border-[color:var(--color-gold)]/30 bg-transparent px-4 py-3 pr-12"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((visible) => !visible)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-[color:var(--color-gold)] transition-opacity hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-[color:var(--color-gold)]"
                >
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    className="h-5 w-5"
                  >
                    {showPassword ? (
                      <>
                        <path d="M3 3l18 18" />
                        <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
                        <path d="M9.9 4.3A10.8 10.8 0 0 1 12 4c5.2 0 9 4 10 8a11.7 11.7 0 0 1-3.1 5.2M6.1 6.1A11.4 11.4 0 0 0 2 12c1 4 4.8 8 10 8 1.7 0 3.2-.4 4.5-1" />
                      </>
                    ) : (
                      <>
                        <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
                        <circle cx="12" cy="12" r="2.5" />
                      </>
                    )}
                  </svg>
                </button>
              </div>
              {error ? (
                <p className="text-sm text-red-400" role="alert">
                  {error}
                </p>
              ) : null}
              <button
                type="submit"
                className="v6-cta w-full py-3 rounded-full font-bold"
                disabled={busy}
              >
                {mode === 'login' ? t(lang, 'auth.signIn') : t(lang, 'auth.createAccount')}
              </button>
            </form>

            {mode === 'login' ? (
              <button
                type="button"
                className="text-sm self-center hover:text-[color:var(--color-gold)] transition underline-offset-4 hover:underline"
                onClick={onForgotClick}
              >
                {t(lang, 'auth.forgot')}
              </button>
            ) : null}

            <button
              type="button"
              className="v6-theme-btn self-center"
              onClick={() => {
                setMode((m) => (m === 'login' ? 'register' : 'login'));
                setShowReset(false);
                setError('');
                setInfo('');
              }}
            >
              {mode === 'login' ? t(lang, 'auth.needAccount') : t(lang, 'auth.haveAccount')}
            </button>
          </>
        ) : (
          <form className="flex flex-col gap-3" onSubmit={onSendReset}>
            <h2 className="text-lg text-center tracking-wide text-[color:var(--color-gold)]">
              {t(lang, 'auth.resetTitle')}
            </h2>
            <label className="text-xs opacity-70 tracking-wide">
              {t(lang, 'auth.emailLangLabel')}
              <select
                value={lang}
                onChange={(e) => onLangSelect(e.target.value as AuthLang)}
                className="mt-1 w-full rounded-xl border border-[color:var(--color-gold)]/30 bg-transparent px-4 py-3"
                aria-label={t(lang, 'auth.emailLangLabel')}
              >
                <option value="en">{t(lang, 'auth.langOptionEn')}</option>
                <option value="fr">{t(lang, 'auth.langOptionFr')}</option>
                <option value="es">{t(lang, 'auth.langOptionEs')}</option>
              </select>
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t(lang, 'auth.email')}
              className="w-full rounded-xl border border-[color:var(--color-gold)]/30 bg-transparent px-4 py-3"
              autoComplete="email"
            />
            {error ? (
              <p className="text-sm text-red-400" role="alert">
                {error}
              </p>
            ) : null}
            {info ? (
              <p className="text-sm text-[color:var(--color-gold)]" role="status">
                {info}
              </p>
            ) : null}
            <button
              type="submit"
              className="v6-cta w-full py-3 rounded-full font-bold"
              disabled={busy}
            >
              {busy ? t(lang, 'auth.sendingReset') : t(lang, 'auth.sendReset')}
            </button>
            <button
              type="button"
              className="text-sm self-center hover:text-[color:var(--color-gold)] transition"
              onClick={() => {
                setShowReset(false);
                setError('');
                setInfo('');
              }}
            >
              {t(lang, 'auth.backToSignIn')}
            </button>
          </form>
        )}

        <Link
          to="/"
          className="text-center text-sm hover:text-[color:var(--color-gold)] transition"
        >
          {t(lang, 'auth.backHome')}
        </Link>
      </section>
    </div>
  );
}
