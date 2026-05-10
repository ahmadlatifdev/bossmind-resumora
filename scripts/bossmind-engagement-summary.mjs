#!/usr/bin/env node
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { getSqlClient, saveEvent, upsertTaskState } = require("../lib/shared/neon-memory");

const PROJECT_KEY = process.env.BOSSMIND_PROJECT_KEY || "resumora";

async function main() {
  const sql = getSqlClient();
  if (!sql) {
    console.log(JSON.stringify({ ok: false, reason: "NEON_DATABASE_URL missing" }, null, 2));
    process.exit(0);
  }

  const rows = await sql(
    `WITH likes AS (
       SELECT resource_key, COUNT(*)::int AS likes FROM engagement_likes GROUP BY resource_key
     ),
     saves AS (
       SELECT resource_key, COUNT(*)::int AS saves FROM engagement_saves GROUP BY resource_key
     ),
     reqs AS (
       SELECT resource_key, COUNT(*)::int AS requests FROM engagement_requests GROUP BY resource_key
     )
     SELECT COALESCE(l.resource_key, s.resource_key, r.resource_key) AS key,
            COALESCE(l.likes,0) AS likes,
            COALESCE(s.saves,0) AS saves,
            COALESCE(r.requests,0) AS requests,
            (COALESCE(l.likes,0) + COALESCE(s.saves,0)*1.2 + COALESCE(r.requests,0)*2.2)::numeric(10,2) AS score
     FROM likes l
     FULL OUTER JOIN saves s ON s.resource_key = l.resource_key
     FULL OUTER JOIN reqs r ON r.resource_key = COALESCE(l.resource_key, s.resource_key)
     ORDER BY score DESC
     LIMIT 8`
  );

  await upsertTaskState({
    projectKey: PROJECT_KEY,
    taskKey: "engagement:summary",
    status: "completed",
    assignedAgent: "engagement-summary",
    payload: { generatedAt: new Date().toISOString(), top: rows.slice(0, 3) },
  });
  await saveEvent({
    projectKey: PROJECT_KEY,
    eventType: "engagement.summary.generated",
    severity: "info",
    source: "bossmind-engagement-summary",
    payload: { top: rows.slice(0, 5) },
  });

  console.log(JSON.stringify({ ok: true, top: rows }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
