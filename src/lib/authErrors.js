/**
 * Map Firebase Auth error codes → i18n keys (EN/FR/ES via t()).
 * Never includes secrets or raw credential material.
 */
export function authErrorCode(err) {
  if (err && typeof err === 'object' && 'code' in err) {
    return String(err.code || '');
  }
  return '';
}

/** @type {Record<string, string>} */
const CODE_TO_KEY = {
  'auth/invalid-email': 'auth.errInvalidEmail',
  'auth/user-disabled': 'auth.errUserDisabled',
  'auth/user-not-found': 'auth.errInvalidCredential',
  'auth/wrong-password': 'auth.errInvalidCredential',
  'auth/invalid-credential': 'auth.errInvalidCredential',
  'auth/invalid-login-credentials': 'auth.errInvalidCredential',
  'auth/too-many-requests': 'auth.errTooManyRequests',
  'auth/network-request-failed': 'auth.errNetwork',
  'auth/popup-closed-by-user': 'auth.errPopupClosed',
  'auth/cancelled-popup-request': 'auth.errPopupClosed',
  'auth/popup-blocked': 'auth.errPopupBlocked',
  'auth/account-exists-with-different-credential': 'auth.errAccountExists',
  'auth/email-already-in-use': 'auth.errEmailInUse',
  'auth/weak-password': 'auth.passwordWeak',
  'auth/operation-not-allowed': 'auth.errProviderDisabled',
  'auth/configuration-not-found': 'auth.errProviderDisabled',
  'auth/unauthorized-domain': 'auth.unauthorizedDomain',
  'auth/internal-error': 'auth.errInternal',
  'auth/missing-password': 'auth.errMissingPassword',
  'auth/missing-email': 'auth.needEmail',
  'auth/invalid-action-code': 'auth.resetLinkInvalid',
  'auth/expired-action-code': 'auth.resetLinkInvalid',
  'resumora/rate-limited': 'auth.resetRateLimited',
  'resumora/weak-password': 'auth.passwordWeak',
};

/**
 * @param {(lang: string, key: string) => string} t
 * @param {string} lang
 * @param {unknown} err
 * @param {string} fallbackKey
 */
export function mapAuthError(t, lang, err, fallbackKey = 'auth.failed') {
  const code = authErrorCode(err);
  if (code === 'resumora/rate-limited') {
    const sec =
      err && typeof err === 'object' && 'retryAfterSec' in err
        ? Number(err.retryAfterSec) || 60
        : 60;
    return t(lang, 'auth.resetRateLimited').replace('{seconds}', String(sec));
  }
  const key = CODE_TO_KEY[code] || fallbackKey;
  return t(lang, key);
}

export function logAuthFailure(scope, err) {
  const code = authErrorCode(err);
  const message =
    err && typeof err === 'object' && 'message' in err
      ? String(err.message || '').slice(0, 160)
      : '';
  console.warn(
    JSON.stringify({
      scope: `auth.${scope}`,
      code: code || 'unknown',
      message,
    })
  );
}
