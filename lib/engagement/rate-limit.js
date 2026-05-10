const windows = new Map();

/**
 * Simple in-memory sliding window limiter for engagement action endpoint.
 * Suitable for single-node runtime; Neon logs still provide durable audit.
 */
function checkRateLimit({
  scope,
  limit = 24,
  windowMs = 60_000,
}) {
  const key = String(scope || "anon");
  const now = Date.now();
  const arr = windows.get(key) || [];
  const fresh = arr.filter((ts) => now - ts < windowMs);
  if (fresh.length >= limit) {
    windows.set(key, fresh);
    return { ok: false, remaining: 0, retryAfterMs: windowMs - (now - fresh[0]) };
  }
  fresh.push(now);
  windows.set(key, fresh);
  return { ok: true, remaining: Math.max(0, limit - fresh.length), retryAfterMs: 0 };
}

module.exports = { checkRateLimit };
