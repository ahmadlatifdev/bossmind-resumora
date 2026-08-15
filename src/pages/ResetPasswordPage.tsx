import React, { useState } from 'react';
import SiteHeader from '../components/SiteHeader';
import { getLang, setLang, t } from '../lib/i18n.js';
import {
  getAuth,
  sendPasswordResetEmail,
  RecaptchaVerifier,
  signInWithPhoneNumber,
} from 'firebase/auth';
import { app } from '../lib/firebase';

export default function ResetPasswordPage() {
  const [lang, setLangState] = useState(() => getLang());
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [confirmation, setConfirmation] = useState(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function switchLang(next) {
    setLangState(setLang(next));
  }

  async function sendEmailReset(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setStatus('');
    try {
      const auth = getAuth(app);
      await sendPasswordResetEmail(auth, email.trim());
      setStatus(t(lang, 'reset.sendLink') + ' ✓');
    } catch (err) {
      setError(err?.message || 'Email reset failed.');
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
      if (!window.recaptchaVerifier) {
        window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
          size: 'invisible',
        });
      }
      const result = await signInWithPhoneNumber(auth, phone.trim(), window.recaptchaVerifier);
      setConfirmation(result);
      setStatus(t(lang, 'reset.sendSms') + ' ✓');
    } catch (err) {
      setError(err?.message || 'SMS OTP failed.');
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
      setStatus(t(lang, 'reset.verify') + ' ✓');
    } catch (err) {
      setError(err?.message || 'Invalid OTP.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app-shell">
      <SiteHeader lang={lang} onLangChange={switchLang} currentPath="/reset-password" />

      <main className="app-main narrow">
        <h1>{t(lang, 'reset.title')}</h1>
        <p className="lead">{t(lang, 'reset.lead')}</p>

        <form className="panel" onSubmit={sendEmailReset}>
          <h2>Email</h2>
          <label>
            Email
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <button className="primary" type="submit" disabled={busy}>
            {t(lang, 'reset.sendLink')}
          </button>
        </form>

        <form className="panel" onSubmit={sendSmsOtp}>
          <h2>{t(lang, 'reset.cell')}</h2>
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
              OTP
              <input value={otp} onChange={(e) => setOtp(e.target.value)} inputMode="numeric" />
            </label>
            <button className="primary" type="submit" disabled={busy}>
              {t(lang, 'reset.verify')}
            </button>
          </form>
        ) : null}

        {status ? <p className="banner ok">{status}</p> : null}
        {error ? <p className="banner err">{error}</p> : null}
      </main>
    </div>
  );
}
