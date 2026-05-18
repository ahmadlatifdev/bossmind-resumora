/**
 * Transient Neon/Postgres retry helpers (no secret logging).
 */

const TRANSIENT_PATTERNS = [
  /ECONNRESET/i,
  /ETIMEDOUT/i,
  /ENOTFOUND/i,
  /connection terminated/i,
  /timeout/i,
  /too many connections/i,
  /Connection refused/i,
];

function isTransientDatabaseError(err) {
  const msg = err?.message || String(err || "");
  return TRANSIENT_PATTERNS.some((re) => re.test(msg));
}

async function withDatabaseRetry(fn, { attempts = 3, baseMs = 200 } = {}) {
  let lastError;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      if (!isTransientDatabaseError(e) || i === attempts - 1) throw e;
      await new Promise((r) => setTimeout(r, baseMs * (i + 1)));
    }
  }
  throw lastError;
}

function databaseRecoveryHint(reason) {
  if (reason === "no_database_url" || reason === "database_url_missing") {
    return "Set NEON_DATABASE_URL and DATABASE_URL on Render, redeploy, then verify /api/health.";
  }
  if (reason === "connection_failed" || isTransientDatabaseError({ message: reason })) {
    return "Database connection failed. Retry in a moment or check Neon project status.";
  }
  return "Contact support if this persists after signing in again.";
}

module.exports = {
  isTransientDatabaseError,
  withDatabaseRetry,
  databaseRecoveryHint,
};
