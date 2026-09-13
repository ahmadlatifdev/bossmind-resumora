import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { t } from '../lib/i18n.js';
import { useLangOptional } from '../i18n/LangContext';
import { getAuth, RecaptchaVerifier, signInWithPhoneNumber } from 'firebase/auth';
import { confirmPasswordReset, verifyPasswordResetCode } from 'firebase/auth';
import { app } from '../lib/firebase';
import { requestPasswordReset } from '../lib/authActions';
import { detectDefaultCountry, formatE164, type Country } from '../lib/countryCodes';
import CountryCodeSelect from '../components/CountryCodeSelect';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

export default function ResetPasswordPage() {
  const { lang } = useLangOptional();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const oobCode = searchParams.get('oobCode') || '';
  const isResetRequest = searchParams.get('mode') === 'resetPassword' && Boolean(oobCode);
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [selectedCountry, setSelectedCountry] = useState<Country>(() => detectDefaultCountry());
  const [otp, setOtp] = useState('');
  const [confirmation, setConfirmation] = useState(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [resetVerifying, setResetVerifying] = useState(isResetRequest);
  const [resetReady, setResetReady] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useEffect(() => {
    if (!isResetRequest) return undefined;
    let active = true;
    setResetVerifying(true);
    verifyPasswordResetCode(getAuth(app), oobCode)
      .then(() => {
        if (active) setResetReady(true);
      })
      .catch(() => {
        if (active) setError('This password reset link is invalid or has expired.');
      })
      .finally(() => {
        if (active) setResetVerifying(false);
      });
    return () => {
      active = false;
    };
  }, [isResetRequest, oobCode]);

  useEffect(() => {
    if (!status || !isResetRequest || !status.includes('successfully')) return undefined;
    const timer = window.setTimeout(() => navigate('/login', { replace: true }), 3000);
    return () => window.clearTimeout(timer);
  }, [isResetRequest, navigate, status]);

  async function sendEmailReset(e) {
    e.preventDefault();
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError('Enter your email address.');
      return;
    }
    setBusy(true);
    setError('');
    setStatus('');
    try {
      await requestPasswordReset(trimmedEmail);
      setStatus(t(lang, 'reset.sendLink') + ' ✓');
    } catch (err) {
      setError(err?.message || t(lang, 'reset.emailFailed'));
    } finally {
      setBusy(false);
    }
  }

  async function updatePassword(e) {
    e.preventDefault();
    setError('');
    if (newPassword.length < 8) {
      setError('Choose a password with at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      await confirmPasswordReset(getAuth(app), oobCode, newPassword);
      setStatus('Password reset successfully. Redirecting to sign in…');
      setResetReady(false);
    } catch (err) {
      setError(err?.message || 'Unable to reset your password. The link may have expired.');
    } finally {
      setBusy(false);
    }
  }

  async function sendSmsOtp(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setStatus('');
    try {
      const auth = getAuth(app);
      const e164Phone = formatE164(selectedCountry.dial, phone);
      if (e164Phone === selectedCountry.dial) {
        setError('Enter a valid phone number.');
        return;
      }
      if (!window.recaptchaVerifier) {
        window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
          size: 'invisible',
        });
      }
      const result = await signInWithPhoneNumber(auth, e164Phone, window.recaptchaVerifier);
      setConfirmation(result);
      setStatus(t(lang, 'reset.sendSms') + ' ✓');
    } catch (err) {
      const code = err && typeof err === 'object' && 'code' in err ? String(err.code || '') : '';
      if (code === 'auth/operation-not-allowed') {
        setError(
          'Phone verification is not available in your region yet. Please use email reset instead.'
        );
      } else {
        setError('Unable to send the verification code. Please use email reset instead.');
      }
    } finally {
      setBusy(false);
    }
  }

  async function verifyOtp(e) {
    e.preventDefault();
    if (!confirmation) return;
    setBusy(true);
    setError('');
    try {
      await confirmation.confirm(otp.trim());
      const currentUser = getAuth(app).currentUser;
      if (currentUser?.phoneNumber) {
        await setDoc(
          doc(db, 'users', currentUser.uid),
          { phoneCountryCode: selectedCountry.code },
          { merge: true }
        );
      }
      setStatus(t(lang, 'reset.verify') + ' ✓');
    } catch (err) {
      setError(err?.message || t(lang, 'reset.invalidOtp'));
    } finally {
      setBusy(false);
    }
  }

  if (isResetRequest && resetVerifying) {
    return (
      <div className="app-main narrow page-content" aria-busy="true">
        <h1>{t(lang, 'reset.title')}</h1>
        <p className="lead">Verifying your password reset link…</p>
        <div className="reset-spinner" role="status" aria-label="Verifying reset link">
          <span aria-hidden="true">⟳</span>
        </div>
      </div>
    );
  }

  if (isResetRequest && !resetReady) {
    return (
      <div className="app-main narrow page-content">
        <h1>{t(lang, 'reset.title')}</h1>
        <p className="banner err" role="alert">
          {error || 'This password reset link is invalid or has expired.'}{' '}
          <Link to="/reset-password">Request a new reset link</Link>
        </p>
      </div>
    );
  }

  if (isResetRequest && resetReady) {
    return (
      <div className="app-main narrow page-content">
        <h1>{t(lang, 'reset.title')}</h1>
        <p className="lead">Choose a new password for your account.</p>
        <form className="panel" onSubmit={updatePassword}>
          <label>
            New password
            <input
              type="password"
              required
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
            />
          </label>
          <p className="muted small" role="status">
            Password strength:{' '}
            {newPassword.length >= 8 ? 'Strong enough' : 'Use at least 8 characters'}
          </p>
          <label>
            Confirm new password
            <input
              type="password"
              required
              minLength={8}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
            />
          </label>
          {error ? (
            <p className="banner err" role="alert">
              {error}
            </p>
          ) : null}
          <button className="primary" type="submit" disabled={busy}>
            {busy ? 'Resetting…' : 'Set new password'}
          </button>
        </form>
        {status ? (
          <p className="banner ok" role="status">
            {status}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="app-main narrow page-content">
      <h1>{t(lang, 'reset.title')}</h1>
      <p className="lead">{t(lang, 'reset.lead')}</p>

      <form className="panel" onSubmit={sendEmailReset}>
        <label>
          {t(lang, 'auth.email')}
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <button className="primary" type="submit" disabled={busy || !email.trim()}>
          {busy ? 'Sending…' : t(lang, 'reset.sendLink')}
        </button>
      </form>

      <form className="panel" onSubmit={sendSmsOtp}>
        <h2>{t(lang, 'reset.cell')}</h2>
        <CountryCodeSelect value={selectedCountry} onChange={setSelectedCountry} />
        <label>
          {t(lang, 'reset.phoneLabel')}
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+1…"
          />
        </label>
        <div id="recaptcha-container" />
        <button className="secondary" type="submit" disabled={busy || !phone.trim()}>
          {t(lang, 'reset.sendSms')}
        </button>
      </form>

      {confirmation ? (
        <form className="panel" onSubmit={verifyOtp}>
          <label>
            {t(lang, 'reset.otpLabel')}
            <input value={otp} onChange={(e) => setOtp(e.target.value)} inputMode="numeric" />
          </label>
          <button className="primary" type="submit" disabled={busy}>
            {t(lang, 'reset.verify')}
          </button>
        </form>
      ) : null}

      {status ? <p className="banner ok">{status}</p> : null}
      {error ? <p className="banner err">{error}</p> : null}
    </div>
  );
}
