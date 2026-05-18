/**
 * Shared database gate for engagement APIs (probe + retry + structured 503).
 */
const {
  probeDatabaseConnection,
  getDatabaseConfigStatus,
} = require("./neon-memory");
const { databaseRecoveryHint } = require("./database-resilience");

async function requireDatabaseReady() {
  const probe = await probeDatabaseConnection();
  if (probe.ok) {
    return { ok: true, probe };
  }
  const status = getDatabaseConfigStatus();
  const reason = probe.reason || status.source || "no_database_url";
  return {
    ok: false,
    status: 503,
    body: {
      error: "Database unavailable",
      reason,
      configured: status.configured,
      recoveryHint: databaseRecoveryHint(reason),
    },
  };
}

module.exports = { requireDatabaseReady };
