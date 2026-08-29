/**
 * Short-lived in-memory cache for Stripe PMC + config IDs (edge-adjacent, per instance).
 */
const cache = new Map();
const DEFAULT_TTL_MS = 5 * 60 * 1000;

function cacheGet(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expires) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

function cacheSet(key, value, ttlMs = DEFAULT_TTL_MS) {
  cache.set(key, { value, expires: Date.now() + ttlMs });
  return value;
}

async function getCachedPaymentMethodConfigurationId(stripe, fetchFn) {
  const key = 'pmc_default';
  const hit = cacheGet(key);
  if (hit) return hit;
  const id = await fetchFn(stripe);
  return cacheSet(key, id);
}

module.exports = { cacheGet, cacheSet, getCachedPaymentMethodConfigurationId };
