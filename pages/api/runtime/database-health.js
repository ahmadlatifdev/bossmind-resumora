/**
 * Database runtime health + recovery hints (no secrets).
 */
require("../../../lib/shared/ensure-project-env");
const { probeDatabaseConnection } = require("../../../lib/shared/neon-memory");
const { auditPlansRuntime } = require("../../../lib/shared/plans-runtime-sync");
const { databaseRecoveryHint } = require("../../../lib/shared/database-resilience");

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const database = await probeDatabaseConnection();
  const plans = auditPlansRuntime();
  const ok = database.ok;

  return res.status(ok ? 200 : 503).json({
    ok,
    ts: Date.now(),
    env: process.env.NODE_ENV || "development",
    database,
    plans: { ok: plans.ok, planIds: plans.planIds },
    recoveryHint: database.ok ? null : databaseRecoveryHint(database.reason),
    orm: "neon-serverless",
    prismaAppRuntime: false,
  });
}
