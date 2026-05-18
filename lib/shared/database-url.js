/**
 * Resolve Postgres connection URL from standard env aliases (Render/Railway/Neon).
 * Does not log or expose secret values.
 */

const DATABASE_URL_ENV_KEYS = [
  "NEON_DATABASE_URL",
  "DATABASE_URL",
  "POSTGRES_URL",
  "POSTGRES_PRISMA_URL",
];

function resolveDatabaseUrl() {
  for (const key of DATABASE_URL_ENV_KEYS) {
    const v = process.env[key];
    if (v != null && String(v).trim() !== "") {
      return { url: String(v).trim(), source: key };
    }
  }
  return { url: null, source: null };
}

/** Mirror the winning URL into canonical NEON_DATABASE_URL + DATABASE_URL when missing. */
function syncDatabaseEnvAliases() {
  const { url } = resolveDatabaseUrl();
  if (!url) return { synced: false };
  let synced = false;
  if (!process.env.NEON_DATABASE_URL) {
    process.env.NEON_DATABASE_URL = url;
    synced = true;
  }
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = url;
    synced = true;
  }
  return { synced, source: resolveDatabaseUrl().source };
}

function databaseUrlConfigured() {
  return Boolean(resolveDatabaseUrl().url);
}

module.exports = {
  DATABASE_URL_ENV_KEYS,
  resolveDatabaseUrl,
  syncDatabaseEnvAliases,
  databaseUrlConfigured,
};
