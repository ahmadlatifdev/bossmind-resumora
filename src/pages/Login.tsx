import { type FormEvent, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
} from 'firebase/auth';
import { auth, setAuthEmailLanguage } from '../lib/firebase';
import '../v6-luxury.css';

type AuthLang = 'en' | 'fr' | 'es';

const RESET_COPY: Record<
  AuthLang,
  {
    forgot: string;
    resetTitle: string;
    send: string;
    back: string;
    success: string;
    needEmail: string;
    langLabel: string;
  }
> = {
  en: {
    forgot: 'Forgot password?',
    resetTitle: 'Reset your password',
    send: 'Send reset email',
    back: 'Back to sign in',
    success: 'Password reset email sent! Check your inbox.',
    needEmail: 'Enter your email address to reset your password.',
    langLabel: 'Email language',
  },
  fr: {
    forgot: 'Mot de passe oublié ?',
    resetTitle: 'Réinitialiser votre mot de passe',
    send: "Envoyer l'e-mail de réinitialisation",
    back: 'Retour à la connexion',
    success: 'E-mail de réinitialisation envoyé ! Vérifiez votre boîte de réception.',
    needEmail: 'Saisissez votre adresse e-mail pour réinitialiser votre mot de passe.',
    langLabel: "Langue de l'e-mail",
  },
  es: {
    forgot: '¿Olvidaste tu contraseña?',
    resetTitle: 'Restablecer tu contraseña',
    send: 'Enviar correo de restablecimiento',
    back: 'Volver a iniciar sesión',
    success: '¡Correo de restablecimiento enviado! Revisa tu bandeja de entrada.',
    needEmail: 'Introduce tu correo electrónico para restablecer tu contraseña.',
    langLabel: 'Idioma del correo',
  },
};

function detectBrowserLang(): AuthLang {
  const raw =
    (typeof navigator !== 'undefined' && (navigator.language || navigator.languages?.[0])) || 'en';
  const lower = String(raw).toLowerCase();
  if (lower.startsWith('fr')) return 'fr';
  if (lower.startsWith('es')) return 'es';
  return 'en';
}

/**
 * Password reset only sets Firebase Auth language for the email template.
 * It does not sign the user out or write subscription fields in Firestore.
 */
export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const from =
    searchParams.get('from') ||
    (location.state as { from?: string } | null)?.from ||
    '/video-library';

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [showReset, setShowReset] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lang, setLang] = useState<AuthLang>(() => detectBrowserLang());
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);

  const copy = useMemo(() => RESET_COPY[lang], [lang]);

  const finish = () => navigate(from, { replace: true });

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setInfo('');
    setBusy(true);
    try {
      if (mode === 'login') {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      } else {
        await createUserWithEmailAndPassword(auth, email.trim(), password);
      }
      setFailedAttempts(0);
      finish();
    } catch (err) {
      if (mode === 'login') {
        setFailedAttempts((n) => n + 1);
        setShowReset(true);
      }
      setError(err instanceof Error ? err.message : 'Authentication failed.');
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
      setError(err instanceof Error ? err.message : 'Google sign-in failed.');
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
      setError(copy.needEmail);
      return;
    }
    setBusy(true);
    try {
      // Language for Firebase Auth email templates only — no session/Firestore mutation.
      setAuthEmailLanguage(lang);
      await sendPasswordResetEmail(auth, trimmed);
      setInfo(copy.success);
    } catch (err) {
      const code =
        err && typeof err === 'object' && 'code' in err
          ? String((err as { code?: string }).code || '')
          : '';
      if (code === 'auth/configuration-not-found') {
        console.warn(
          'Fix required: Go to Firebase Console > Authentication > Sign-in methods > Enable Email/Password.'
        );
        setError(
          'Password reset is temporarily unavailable. Please contact support and ask them to enable Email/Password sign-in in the Firebase Console.'
        );
      } else {
        setError(
          'Something went wrong. Please try again later. Contact support if the issue persists.'
        );
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="v6-shell min-h-screen font-sans">
      <div className="v6-mesh" aria-hidden="true" />
      <main className="flex flex-col items-center justify-center px-4 py-20">
        <section className="v6-hero-panel max-w-md w-full flex flex-col gap-5">
          <h1 className="v6-heading text-3xl text-center">Member Access</h1>
          <p className="v6-subhead text-center opacity-80 text-sm">
            Sign in to unlock the Video Library. Active subscribers only.
          </p>

          {!showReset ? (
            <>
              <button
                type="button"
                className="v6-cta w-full py-3 rounded-full font-bold"
                onClick={onGoogle}
                disabled={busy}
              >
                Continue with Google
              </button>

              <div className="text-center text-xs opacity-60 tracking-widest uppercase">
                or email
              </div>

              <form className="flex flex-col gap-3" onSubmit={onSubmit}>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email"
                  className="w-full rounded-xl border border-[#D4AF37]/30 bg-transparent px-4 py-3"
                  autoComplete="email"
                />
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  className="w-full rounded-xl border border-[#D4AF37]/30 bg-transparent px-4 py-3"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                />
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
                  {mode === 'login' ? 'Sign in' : 'Create account'}
                </button>
              </form>

              {mode === 'login' ? (
                <button
                  type="button"
                  className="text-sm self-center hover:text-[#D4AF37] transition underline-offset-4 hover:underline"
                  onClick={onForgotClick}
                >
                  {copy.forgot}
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
                {mode === 'login' ? 'Need an account? Register' : 'Have an account? Sign in'}
              </button>
            </>
          ) : (
            <form className="flex flex-col gap-3" onSubmit={onSendReset}>
              <h2 className="text-lg text-center tracking-wide text-[#D4AF37]">
                {copy.resetTitle}
              </h2>
              <label className="text-xs opacity-70 tracking-wide">
                {copy.langLabel}
                <select
                  value={lang}
                  onChange={(e) => setLang(e.target.value as AuthLang)}
                  className="mt-1 w-full rounded-xl border border-[#D4AF37]/30 bg-transparent px-4 py-3"
                  aria-label={copy.langLabel}
                >
                  <option value="en">English (EN)</option>
                  <option value="fr">Français (FR)</option>
                  <option value="es">Español (ES)</option>
                </select>
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                className="w-full rounded-xl border border-[#D4AF37]/30 bg-transparent px-4 py-3"
                autoComplete="email"
              />
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
                {copy.send}
              </button>
              <button
                type="button"
                className="text-sm self-center hover:text-[#D4AF37] transition"
                onClick={() => {
                  setShowReset(false);
                  setError('');
                  setInfo('');
                }}
              >
                {copy.back}
              </button>
            </form>
          )}

          <Link to="/" className="text-center text-sm hover:text-[#D4AF37] transition">
            Back to Home
          </Link>
        </section>
      </main>
    </div>
  );
}
