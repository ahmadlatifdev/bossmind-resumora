const crypto = require("crypto");
const { getSqlClient, saveEvent } = require("../shared/neon-memory");
const { ensureEngagementSchema } = require("../shared/neon-memory");
const { deliverPasswordResetCode, auditProviders } = require("../shared/verification-delivery");
const { hashPassword } = require("./password");
const { createSession } = require("./store");

const CODE_TTL_MS = 15 * 60 * 1000;
const MAX_VERIFY_ATTEMPTS = 5;
const RATE_WINDOW_MS = 60 * 60 * 1000;
const RATE_MAX_PER_WINDOW = 5;

function digestCode(code) {
  return crypto.createHash("sha256").update(String(code).trim()).digest("hex");
}

function generateCode() {
  return String(crypto.randomInt(100000, 999999));
}

function normalizePhone(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.startsWith("1") && digits.length === 11) return `+${digits}`;
  if (String(raw).trim().startsWith("+")) return `+${digits}`;
  return `+${digits}`;
}

async function checkRateLimit(bucketKey) {
  const sql = getSqlClient();
  if (!sql) return { ok: false, error: "database_unavailable" };
  const windowStart = new Date(Math.floor(Date.now() / RATE_WINDOW_MS) * RATE_WINDOW_MS);
  const rows = await sql(
    `INSERT INTO engagement_password_reset_rate (bucket_key, window_start, request_count)
     VALUES ($1, $2, 1)
     ON CONFLICT (bucket_key, window_start)
     DO UPDATE SET request_count = engagement_password_reset_rate.request_count + 1
     RETURNING request_count`,
    [bucketKey, windowStart.toISOString()]
  );
  const count = rows[0]?.request_count ?? 1;
  if (count > RATE_MAX_PER_WINDOW) {
    return { ok: false, error: "rate_limited" };
  }
  return { ok: true };
}

async function requestPasswordReset({ email, phone, lang = "en", channel = "email" }) {
  await ensureEngagementSchema();
  const sql = getSqlClient();
  if (!sql) return { ok: false, error: "database_unavailable" };

  const normalizedEmail = String(email || "")
    .trim()
    .toLowerCase();
  const normalizedPhone = normalizePhone(phone);
  if (!normalizedEmail) return { ok: false, error: "email_required" };

  const rate = await checkRateLimit(`reset:${normalizedEmail}`);
  if (!rate.ok) return rate;

  const profiles = await sql(
    `SELECT id, email FROM engagement_profiles WHERE email = $1`,
    [normalizedEmail]
  );
  if (!profiles.length) {
    return { ok: true, generic: true, message: "If an account exists, a code was sent." };
  }

  const profile = profiles[0];
  const code = generateCode();
  const codeHash = digestCode(code);
  const expiresAt = new Date(Date.now() + CODE_TTL_MS);

  const useSms = channel === "sms" || channel === "both" || Boolean(normalizedPhone);
  const useEmail = channel === "email" || channel === "both" || !useSms;
  const destChannel = useSms && useEmail ? "both" : useSms ? "sms" : "email";
  const destination = useSms && normalizedPhone ? normalizedPhone : normalizedEmail;

  await sql(
    `UPDATE engagement_password_resets SET consumed_at = NOW()
     WHERE profile_id = $1 AND consumed_at IS NULL AND expires_at > NOW()`,
    [profile.id]
  );

  const delivery = await deliverPasswordResetCode({
    email: useEmail ? normalizedEmail : null,
    phone: useSms ? normalizedPhone : null,
    code,
    lang,
  });

  await sql(
    `INSERT INTO engagement_password_resets
     (profile_id, code_hash, channel, destination, expires_at, delivery_meta)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [
      profile.id,
      codeHash,
      destChannel,
      destination,
      expiresAt.toISOString(),
      JSON.stringify({
        email: delivery.email,
        sms: delivery.sms,
        providers: auditProviders(),
      }),
    ]
  );

  try {
    await saveEvent({
      projectKey: "resumora",
      eventType: "password_reset_requested",
      severity: delivery.ok ? "info" : "warn",
      source: "password-reset",
      payload: { channel: destChannel, deliveryOk: delivery.ok },
    });
  } catch {
    /* non-fatal */
  }

  if (!delivery.ok) {
    return {
      ok: false,
      error: "delivery_failed",
      delivery,
      retryable: true,
    };
  }

  return {
    ok: true,
    generic: true,
    message: "If an account exists, a code was sent.",
    delivery: { email: delivery.email?.ok, sms: delivery.sms?.ok },
  };
}

async function verifyPasswordResetCode({ email, code }) {
  await ensureEngagementSchema();
  const sql = getSqlClient();
  if (!sql) return { ok: false, error: "database_unavailable" };

  const normalizedEmail = String(email || "")
    .trim()
    .toLowerCase();
  if (!normalizedEmail || !code) return { ok: false, error: "invalid_request" };

  const profiles = await sql(`SELECT id FROM engagement_profiles WHERE email = $1`, [normalizedEmail]);
  if (!profiles.length) return { ok: false, error: "invalid_code" };

  const rows = await sql(
    `SELECT id, code_hash, attempts, expires_at, consumed_at
     FROM engagement_password_resets
     WHERE profile_id = $1 AND consumed_at IS NULL
     ORDER BY created_at DESC LIMIT 1`,
    [profiles[0].id]
  );
  if (!rows.length) return { ok: false, error: "invalid_code" };

  const row = rows[0];
  if (row.consumed_at || new Date(row.expires_at) < new Date()) {
    return { ok: false, error: "code_expired" };
  }
  if (row.attempts >= MAX_VERIFY_ATTEMPTS) {
    return { ok: false, error: "too_many_attempts" };
  }

  const codeHash = digestCode(code);
  const a = Buffer.from(codeHash, "hex");
  const b = Buffer.from(row.code_hash, "hex");
  const match = a.length === b.length && crypto.timingSafeEqual(a, b);
  if (!match) {
    await sql(`UPDATE engagement_password_resets SET attempts = attempts + 1 WHERE id = $1`, [row.id]);
    return { ok: false, error: "invalid_code" };
  }

  await sql(`UPDATE engagement_password_resets SET verified_at = NOW() WHERE id = $1`, [row.id]);
  return { ok: true, resetId: row.id, profileId: profiles[0].id };
}

async function completePasswordReset({ email, code, newPassword }) {
  const verified = await verifyPasswordResetCode({ email, code });
  if (!verified.ok) return verified;

  const sql = getSqlClient();
  if (!sql) return { ok: false, error: "database_unavailable" };
  if (!newPassword || String(newPassword).length < 8) {
    return { ok: false, error: "password_too_short" };
  }

  const { salt, hash } = hashPassword(newPassword);
  await sql(
    `UPDATE engagement_profiles SET password_hash = $1, password_salt = $2 WHERE id = $3`,
    [hash, salt, verified.profileId]
  );
  await sql(
    `UPDATE engagement_password_resets SET consumed_at = NOW() WHERE profile_id = $1 AND consumed_at IS NULL`,
    [verified.profileId]
  );

  const session = await createSession(verified.profileId);
  try {
    await saveEvent({
      projectKey: "resumora",
      eventType: "password_reset_completed",
      severity: "info",
      source: "password-reset",
      payload: { profileId: verified.profileId },
    });
  } catch {
    /* non-fatal */
  }

  return { ok: true, session };
}

async function auditPasswordResetHealth() {
  await ensureEngagementSchema();
  const sql = getSqlClient();
  const providers = auditProviders();
  let tableOk = false;
  if (sql) {
    try {
      const rows = await sql(
        `SELECT 1 FROM information_schema.tables WHERE table_name = 'engagement_password_resets' LIMIT 1`
      );
      tableOk = rows.length > 0;
    } catch {
      tableOk = false;
    }
  }
  return {
    ok: Boolean(sql) && tableOk && (providers.email.configured || providers.devLog),
    database: Boolean(sql),
    tableOk,
    providers,
    routes: {
      request: true,
      verify: true,
      complete: true,
    },
  };
}

module.exports = {
  requestPasswordReset,
  verifyPasswordResetCode,
  completePasswordReset,
  auditPasswordResetHealth,
  CODE_TTL_MS,
};
