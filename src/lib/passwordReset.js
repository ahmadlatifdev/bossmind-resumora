/**
 * Password reset helpers — generic messaging + client rate limit.
 * Never reveal whether an email is registered.
 */
import {
  confirmPasswordReset,
  sendPasswordResetEmail,
  verifyPasswordResetCode,
} from 'firebase/auth';
import { auth, setAuthEmailLanguage } from './firebase';

export const RESET_CONTINUE_URL = 'https://resumora.net/login?mode=forgot';
export const RESET_ACTION_URL = 'https://resumora.net/reset-password';

const RATE_KEY = 'resumora_pw_reset_attempts';
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 3;

/** @returns {{ allowed: boolean, retryAfterSec: number }} */
export function checkResetRateLimit() {
  try {
    const raw = sessionStorage.getItem(RATE_KEY);
    const stamps = raw ? JSON.parse(raw) : [];
    const now = Date.now();
    const recent = (Array.isArray(stamps) ? stamps : []).filter(
      (t) => typeof t === 'number' && now - t < WINDOW_MS
    );
    if (recent.length >= MAX_ATTEMPTS) {
      const oldest = Math.min(...recent);
      const retryAfterSec = Math.max(1, Math.ceil((WINDOW_MS - (now - oldest)) / 1000));
      return { allowed: false, retryAfterSec };
    }
    return { allowed: true, retryAfterSec: 0 };
  } catch {
    return { allowed: true, retryAfterSec: 0 };
  }
}

export function recordResetAttempt() {
  try {
    const raw = sessionStorage.getItem(RATE_KEY);
    const stamps = raw ? JSON.parse(raw) : [];
    const now = Date.now();
    const recent = (Array.isArray(stamps) ? stamps : []).filter(
      (t) => typeof t === 'number' && now - t < WINDOW_MS
    );
    recent.push(now);
    sessionStorage.setItem(RATE_KEY, JSON.stringify(recent));
  } catch {
    /* ignore */
  }
}

/**
 * Strong password: ≥8 chars, upper, lower, digit.
 * @param {string} password
 * @returns {boolean}
 */
export function isStrongPassword(password) {
  const p = String(password || '');
  return p.length >= 8 && /[a-z]/.test(p) && /[A-Z]/.test(p) && /\d/.test(p);
}

export function passwordStrengthHintKey(password) {
  if (!password) return 'auth.passwordPolicy';
  if (!isStrongPassword(password)) return 'auth.passwordWeak';
  return 'auth.passwordStrong';
}

/**
 * Always resolves with a generic success signal for the UI.
 * Does not reveal user-not-found / invalid-email (enumeration-safe).
 * @param {string} email
 * @param {string} [lang]
 */
export async function requestPasswordResetEmail(email, lang = 'en') {
  const trimmed = String(email || '').trim();
  const rate = checkResetRateLimit();
  if (!rate.allowed) {
    const err = new Error('rate_limited');
    err.code = 'resumora/rate-limited';
    err.retryAfterSec = rate.retryAfterSec;
    throw err;
  }

  recordResetAttempt();
  setAuthEmailLanguage(lang);

  try {
    await sendPasswordResetEmail(auth, trimmed, {
      url: RESET_CONTINUE_URL,
      handleCodeInApp: false,
    });
  } catch (err) {
    const code = String(err?.code || '');
    // Configuration / domain issues must surface so ops can fix Console settings.
    if (
      code === 'auth/configuration-not-found' ||
      code === 'auth/unauthorized-domain' ||
      code === 'auth/operation-not-allowed' ||
      code === 'auth/invalid-continue-uri' ||
      code === 'auth/unauthorized-continue-uri'
    ) {
      throw err;
    }
    // Enumeration-safe: treat missing/invalid user as success for the UI.
  }

  return { ok: true };
}

/**
 * @param {string} oobCode
 */
export async function peekResetEmail(oobCode) {
  return verifyPasswordResetCode(auth, oobCode);
}

/**
 * @param {string} oobCode
 * @param {string} newPassword
 */
export async function completePasswordReset(oobCode, newPassword) {
  if (!isStrongPassword(newPassword)) {
    const err = new Error('weak_password');
    err.code = 'resumora/weak-password';
    throw err;
  }
  await confirmPasswordReset(auth, oobCode, newPassword);
  return { ok: true };
}

export function readResetOobFromLocation(search = '') {
  try {
    const params = new URLSearchParams(search || window.location.search);
    const mode = params.get('mode') || '';
    const oobCode = params.get('oobCode') || params.get('oob') || '';
    if (oobCode && (mode === 'resetPassword' || mode === 'forgot' || !mode || mode === 'action')) {
      return oobCode;
    }
    // Firebase sometimes lands with only oobCode
    if (oobCode) return oobCode;
  } catch {
    /* ignore */
  }
  return '';
}
