/**
 * Admin gate auth helpers.
 * - Primary: Secret Manager ADMIN_REFUND_PASSWORD (injected as env).
 * - Optional override: Firestore admin_settings/gate passwordHash (scrypt).
 * Never log password or OTP plaintext.
 */
const crypto = require('crypto');
const { FieldValue, Timestamp } = require('firebase-admin/firestore');
const selfHeal = require('../selfHeal');

const GATE_DOC = ['admin_settings', 'gate'];
const OTP_TTL_MS = 15 * 60 * 1000;
const REQUEST_COOLDOWN_MS = 60 * 1000;
const MIN_PASSWORD_LEN = 12;

function timingSafeEqualString(a, b) {
  const left = Buffer.from(String(a || ''), 'utf8');
  const right = Buffer.from(String(b || ''), 'utf8');
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function providedPassword(req) {
  return String(
    (req && req.get && (req.get('x-admin-password') || req.get('X-Admin-Password'))) ||
      (req && req.body && req.body.adminPassword) ||
      ''
  );
}

function scryptHash(password, saltBuf) {
  const salt = saltBuf || crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(password), salt, 64);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

function scryptVerify(password, stored) {
  const parts = String(stored || '').split(':');
  if (parts.length !== 2) return false;
  const salt = Buffer.from(parts[0], 'hex');
  const expected = parts[1];
  if (!salt.length || !expected) return false;
  const actual = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return timingSafeEqualString(actual, expected);
}

async function readGateDoc(db) {
  const snap = await db.doc(GATE_DOC.join('/')).get();
  return snap.exists ? snap.data() || {} : {};
}

/**
 * Accept either Secret Manager password or Firestore override hash.
 */
async function assertAdminAccess(req, db, envPassword) {
  const provided = providedPassword(req);
  if (!provided) {
    const err = new Error('Unauthorized');
    err.statusCode = 401;
    throw err;
  }

  const gate = await readGateDoc(db);
  if (gate.passwordHash && scryptVerify(provided, gate.passwordHash)) {
    return { via: 'firestore_override' };
  }

  const expected = String(envPassword || '').trim();
  if (expected && timingSafeEqualString(provided, expected)) {
    return { via: 'secret' };
  }

  const err = new Error('Unauthorized');
  err.statusCode = 401;
  throw err;
}

function clientIp(req) {
  const xf = String((req && req.get && req.get('x-forwarded-for')) || '');
  return (xf.split(',')[0] || (req && req.ip) || 'unknown').trim().slice(0, 80);
}

async function requestAdminPasswordReset(db, req) {
  const gate = await readGateDoc(db);
  const now = Date.now();
  const last =
    gate.resetRequestedAt && gate.resetRequestedAt.toMillis ? gate.resetRequestedAt.toMillis() : 0;
  if (last && now - last < REQUEST_COOLDOWN_MS) {
    const err = new Error('Please wait before requesting another reset code');
    err.statusCode = 429;
    throw err;
  }

  const otp = String(crypto.randomInt(100000, 999999));
  const otpHash = scryptHash(otp);
  await db.doc(GATE_DOC.join('/')).set(
    {
      resetOtpHash: otpHash,
      resetExpiresAt: Timestamp.fromMillis(now + OTP_TTL_MS),
      resetRequestedAt: FieldValue.serverTimestamp(),
      resetRequestIp: clientIp(req),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  const notify = await selfHeal.sendAdminNotify({
    subject: 'Resumora Master Admin password reset code',
    text: `Your Master Admin reset code is: ${otp}\nIt expires in 15 minutes.\nIf you did not request this, ignore this email and rotate ADMIN_REFUND_PASSWORD in Secret Manager.`,
    html: `<p>Your Master Admin reset code is: <strong>${otp}</strong></p><p>It expires in 15 minutes.</p><p>If you did not request this, ignore this email and rotate <code>ADMIN_REFUND_PASSWORD</code> in Secret Manager.</p>`,
  });

  return {
    ok: true,
    emailed: !notify?.skipped,
    expiresInMinutes: 15,
    hint: notify?.skipped
      ? 'Email provider not configured. Use scripts/rotate-admin-refund-password.ps1 on a trusted machine.'
      : 'If you are the admin on file, check your inbox for a 6-digit code.',
  };
}

async function confirmAdminPasswordReset(db, body) {
  const code = String((body && body.code) || '').trim();
  const newPassword = String((body && body.newPassword) || '');
  if (!/^\d{6}$/.test(code)) {
    const err = new Error('Invalid or expired code');
    err.statusCode = 400;
    throw err;
  }
  if (newPassword.length < MIN_PASSWORD_LEN) {
    const err = new Error(`Password must be at least ${MIN_PASSWORD_LEN} characters`);
    err.statusCode = 400;
    throw err;
  }

  const gate = await readGateDoc(db);
  const exp =
    gate.resetExpiresAt && gate.resetExpiresAt.toMillis ? gate.resetExpiresAt.toMillis() : 0;
  if (!gate.resetOtpHash || !exp || Date.now() > exp || !scryptVerify(code, gate.resetOtpHash)) {
    const err = new Error('Invalid or expired code');
    err.statusCode = 400;
    throw err;
  }

  const passwordHash = scryptHash(newPassword);
  await db.doc(GATE_DOC.join('/')).set(
    {
      passwordHash,
      passwordUpdatedAt: FieldValue.serverTimestamp(),
      resetOtpHash: FieldValue.delete(),
      resetExpiresAt: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return { ok: true };
}

module.exports = {
  assertAdminAccess,
  requestAdminPasswordReset,
  confirmAdminPasswordReset,
  GATE_DOC,
  MIN_PASSWORD_LEN,
};
