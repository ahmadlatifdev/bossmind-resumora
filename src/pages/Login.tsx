import { type FormEvent, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
} from 'firebase/auth';
import { auth } from '../lib/firebase';
import { upsertUserProfile } from '../lib/userProfile.js';
import { requestPasswordResetEmail, isStrongPassword } from '../lib/passwordReset.js';
import { mapAuthError, logAuthFailure } from '../lib/authErrors.js';
import SiteHeader from '../components/SiteHeader';
import { getLang, normalizeLang, setLang as setUiLang, t } from '../lib/i18n.js';
import '../v6-luxury.css';
import '../app-shell.css';

function googleProvider() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  provider.addScope('email');
  provider.addScope('profile');
  return provider;
}

/**
 * Member Access / Client Registration + Forgot Password.
 * UI language follows SiteHeader EN/FR/ES (resumora_lang).
 */
export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const from =
    searchParams.get('from') ||
    (location.state as { from?: string } | null)?.from ||
    '/video-library';

  const modeParam = searchParams.get('mode');
  const [mode, setMode] = useState<'login' | 'register'>(() =>
    modeParam === 'register' || modeParam === 'signup' ? 'register' : 'login'
  );
  const [showReset, setShowReset] = useState(() => modeParam === 'forgot' || modeParam === 'reset');
  const [uiLang, setUiLangState] = useState(() => getLang());
  const [emailLang, setEmailLang] = useState(() => getLang());
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState(() =>
    modeParam === 'forgot' ? t(getLang(), 'auth.resetLandingHint') : ''
  );
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (modeParam === 'forgot' || modeParam === 'reset') {
      setShowReset(true);
      setMode('login');
      setInfo(t(uiLang, 'auth.resetLandingHint'));
    } else if (modeParam === 'register' || modeParam === 'signup') {
      setShowReset(false);
      setMode('register');
    } else if (modeParam === 'login' || modeParam === null) {
      /* keep current unless explicitly login */
    }
  }, [modeParam, uiLang]);

  const onUiLangChange = (next: string) => {
    const code = setUiLang(next);
    setUiLangState(code);
    setEmailLang(code);
  };

  const setAuthMode = (next: 'login' | 'register') => {
    setMode(next);
    setShowReset(false);
    setError('');
    setInfo('');
    try {
      const url = new URL(window.location.href);
      if (next === 'register') url.searchParams.set('mode', 'register');
      else url.searchParams.delete('mode');
      window.history.replaceState({}, '', url.toString());
    } catch {
      /* ignore */
    }
  };

  const openForgot = () => {
    setError('');
    setInfo('');
    setShowReset(true);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('mode', 'forgot');
      window.history.replaceState({}, '', url.toString());
    } catch {
      /* ignore */
    }
  };

  const closeForgot = () => {
    setShowReset(false);
    setError('');
    setInfo('');
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('mode');
      window.history.replaceState({}, '', url.toString());
    } catch {
      /* ignore */
    }
  };

  const finish = () => navigate(from, { replace: true });

  const persistProfileSafe = async (
    user: import('firebase/auth').User,
    extra: { fullName?: string; locale?: string } = {}
  ) => {
    try {
      await upsertUserProfile(user, extra);
    } catch (profileErr) {
      // Auth already succeeded — do not block Member Access on profile write.
      logAuthFailure('profile_upsert', profileErr);
    }
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setInfo('');
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError(t(uiLang, 'auth.needEmail'));
      return;
    }
    if (!password) {
      setError(t(uiLang, 'auth.errMissingPassword'));
      return;
    }
    if (mode === 'register' && !isStrongPassword(password)) {
      setError(t(uiLang, 'auth.passwordWeak'));
      return;
    }
    setBusy(true);
    try {
      if (mode === 'login') {
        const cred = await signInWithEmailAndPassword(auth, trimmedEmail, password);
        await persistProfileSafe(cred.user, { locale: uiLang });
      } else {
        const cred = await createUserWithEmailAndPassword(auth, trimmedEmail, password);
        await persistProfileSafe(cred.user, {
          fullName: fullName.trim(),
          locale: uiLang,
        });
      }
      finish();
    } catch (err) {
      logAuthFailure(mode === 'login' ? 'email_sign_in' : 'email_register', err);
      setError(mapAuthError(t, uiLang, err, 'auth.failed'));
    } finally {
      setBusy(false);
    }
  };

  const onGoogle = async () => {
    setError('');
    setInfo('');
    setBusy(true);
    try {
      const cred = await signInWithPopup(auth, googleProvider());
      await persistProfileSafe(cred.user, { locale: uiLang });
      finish();
    } catch (err) {
      logAuthFailure('google_sign_in', err);
      setError(mapAuthError(t, uiLang, err, 'auth.googleFailed'));
    } finally {
      setBusy(false);
    }
  };

  const onSendReset = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setInfo('');
    const trimmed = email.trim();
    if (!trimmed) {
      setError(t(uiLang, 'auth.needEmail'));
      return;
    }
    setBusy(true);
    try {
      await requestPasswordResetEmail(trimmed, normalizeLang(emailLang));
      // Always generic — do not reveal whether the account exists.
      setInfo(t(uiLang, 'auth.resetSuccess'));
    } catch (err) {
      logAuthFailure('password_reset', err);
      setError(mapAuthError(t, uiLang, err, 'auth.resetGeneric'));
    } finally {
      setBusy(false);
    }
  };

  const inputClass = 'w-full rounded-xl border border-[#D4AF37]/30 bg-transparent px-4 py-3';

  return (
    <div className="v6-shell min-h-screen font-sans">
      <div className="v6-mesh" aria-hidden="true" />
      <SiteHeader lang={uiLang} onLangChange={onUiLangChange} currentPath="/login" />
      <main className="flex flex-col items-center justify-center px-4 py-20">
        <section className="v6-hero-panel max-w-md w-full flex flex-col gap-5">
          <h1 className="v6-heading text-3xl text-center">
            {showReset
              ? t(uiLang, 'auth.resetTitle')
              : mode === 'register'
                ? t(uiLang, 'auth.registerTitle')
                : t(uiLang, 'auth.memberTitle')}
          </h1>
          <p className="v6-subhead text-center opacity-80 text-sm">
            {showReset
              ? t(uiLang, 'auth.resetLead')
              : mode === 'register'
                ? t(uiLang, 'auth.registerLead')
                : t(uiLang, 'auth.memberLead')}
          </p>

          {!showReset ? (
            <>
              <button
                type="button"
                className="v6-cta w-full py-3 rounded-full font-bold"
                onClick={() => void onGoogle()}
                disabled={busy}
              >
                {t(uiLang, 'auth.continueGoogle')}
              </button>

              <div className="text-center text-xs opacity-60 tracking-widest uppercase">
                {t(uiLang, 'auth.orEmail')}
              </div>

              <form className="flex flex-col gap-3" onSubmit={(e) => void onSubmit(e)} noValidate>
                {mode === 'register' ? (
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder={t(uiLang, 'auth.fullName')}
                    aria-label={t(uiLang, 'auth.fullName')}
                    className={inputClass}
                    autoComplete="name"
                  />
                ) : null}
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t(uiLang, 'auth.email')}
                  aria-label={t(uiLang, 'auth.email')}
                  className={inputClass}
                  autoComplete="email"
                  inputMode="email"
                />
                <input
                  type="password"
                  required
                  minLength={mode === 'register' ? 8 : 6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t(uiLang, 'auth.password')}
                  aria-label={t(uiLang, 'auth.password')}
                  className={inputClass}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                />
                {mode === 'login' ? (
                  <div className="flex justify-end -mt-1">
                    <button
                      type="button"
                      className="text-sm min-h-11 px-2 inline-flex items-center hover:text-[#D4AF37] active:text-[#D4AF37] focus-visible:text-[#D4AF37] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D4AF37] transition underline-offset-4 hover:underline active:underline"
                      onClick={openForgot}
                    >
                      {t(uiLang, 'auth.forgot')}
                    </button>
                  </div>
                ) : (
                  <p className="text-xs opacity-60">{t(uiLang, 'auth.passwordPolicy')}</p>
                )}
                {error ? (
                  <p className="text-sm text-red-400" role="alert">
                    {error}
                  </p>
                ) : null}
                {info ? (
                  <p className="text-sm text-[#D4AF37]" role="status">
                    {info}
                  </p>
                ) : null}
                <button
                  type="submit"
                  className="v6-cta w-full py-3 rounded-full font-bold"
                  disabled={busy}
                >
                  {busy
                    ? t(uiLang, 'auth.working')
                    : mode === 'login'
                      ? t(uiLang, 'auth.signIn')
                      : t(uiLang, 'auth.createAccount')}
                </button>
              </form>

              <button
                type="button"
                className="v6-theme-btn self-center"
                onClick={() => setAuthMode(mode === 'login' ? 'register' : 'login')}
              >
                {mode === 'login' ? t(uiLang, 'auth.needAccount') : t(uiLang, 'auth.haveAccount')}
              </button>
            </>
          ) : (
            <form className="flex flex-col gap-3" onSubmit={(e) => void onSendReset(e)} noValidate>
              <label className="text-xs opacity-70 tracking-wide">
                {t(uiLang, 'auth.emailLangLabel')}
                <select
                  value={emailLang}
                  onChange={(e) => setEmailLang(normalizeLang(e.target.value))}
                  className={`mt-1 ${inputClass}`}
                  aria-label={t(uiLang, 'auth.emailLangLabel')}
                >
                  <option value="en">{t(uiLang, 'auth.langOptionEn')}</option>
                  <option value="fr">{t(uiLang, 'auth.langOptionFr')}</option>
                  <option value="es">{t(uiLang, 'auth.langOptionEs')}</option>
                </select>
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t(uiLang, 'auth.email')}
                aria-label={t(uiLang, 'auth.email')}
                className={inputClass}
                autoComplete="email"
                inputMode="email"
              />
              <p className="text-xs opacity-60">{t(uiLang, 'auth.resetPrivacy')}</p>
              {error ? (
                <p className="text-sm text-red-400" role="alert">
                  {error}
                </p>
              ) : null}
              {info ? (
                <p className="text-sm text-[#D4AF37]" role="status">
                  {info}
                </p>
              ) : null}
              <button
                type="submit"
                className="v6-cta w-full py-3 rounded-full font-bold"
                disabled={busy}
              >
                {busy ? t(uiLang, 'auth.sendingReset') : t(uiLang, 'auth.sendReset')}
              </button>
              <button
                type="button"
                className="text-sm self-center min-h-11 px-2 inline-flex items-center hover:text-[#D4AF37] active:text-[#D4AF37] focus-visible:text-[#D4AF37] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D4AF37] transition"
                onClick={closeForgot}
              >
                {t(uiLang, 'auth.backToSignIn')}
              </button>
            </form>
          )}

          <Link
            to="/"
            className="text-center text-sm min-h-11 inline-flex items-center justify-center hover:text-[#D4AF37] active:text-[#D4AF37] focus-visible:text-[#D4AF37] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D4AF37] transition"
          >
            {t(uiLang, 'auth.backHome')}
          </Link>
        </section>
      </main>
    </div>
  );
}
