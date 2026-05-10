#!/usr/bin/env node
/**
 * Aggregates social growth metrics from event_log social_channel_metric payloads.
 * Output can be consumed by external dashboards or weekly Slack/email jobs.
 */
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { getSqlClient, initializeSharedMemory, saveEvent } = require("../../lib/shared/neon-memory");

const PROJECT_KEY = process.env.BOSSMIND_PROJECT_KEY || "resumora";

async function main() {
  const init = await initializeSharedMemory();
  if (!init.enabled) {
    throw new Error(`Shared memory unavailable: ${init.reason}`);
  }

  const sql = getSqlClient();
  const days = Math.max(1, Number(process.env.SOCIAL_REPORT_DAYS || 14));

  const rows = await sql(
    `SELECT
      source AS platform,
      COUNT(*)::int AS points,
      COALESCE(AVG((payload->>'followers')::numeric), 0)::float8 AS avg_followers,
      COALESCE(AVG((payload->>'engagementRate')::numeric), 0)::float8 AS avg_engagement_rate,
      COALESCE(AVG((payload->>'clicks')::numeric), 0)::float8 AS avg_clicks,
      COALESCE(AVG((payload->>'views')::numeric), 0)::float8 AS avg_views
     FROM event_log
     WHERE project_key = $1
       AND event_type = 'social_channel_metric'
       AND created_at >= NOW() - ($2::text || ' days')::interval
     GROUP BY source
     ORDER BY avg_engagement_rate DESC`,
    [PROJECT_KEY, String(days)]
  );

  const report = {
    projectKey: PROJECT_KEY,
    windowDays: days,
    generatedAt: new Date().toISOString(),
    platforms: rows,
  };

  await saveEvent({
    projectKey: PROJECT_KEY,
    eventType: "social_growth.weekly_report.generated",
    severity: "info",
    source: "social-growth-report",
    eventKey: `${PROJECT_KEY}:${days}:${Date.now()}`,
    payload: report,
  });

  process.stdout.write(JSON.stringify(report, null, 2));
  process.stdout.write("\n");
}

main().catch((error) => {
  console.error(error.message || String(error));
  process.exit(1);
});
