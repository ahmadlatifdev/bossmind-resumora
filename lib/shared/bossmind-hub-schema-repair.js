/**
 * Repair legacy BossMind hub tables missing project_key (Neon CREATE IF NOT EXISTS won't add columns).
 */
const { getSqlClient } = require("./neon-memory");

const TABLES_NEEDING_PROJECT_KEY = [
  "bossmind_memory",
  "bossmind_project_locks",
  "bossmind_design_snapshots",
  "bossmind_deploy_verification",
  "bossmind_shortcut_processes",
  "bossmind_brand_authority",
  "bossmind_payment_links",
  "bossmind_visual_validation",
  "bossmind_marketing_campaigns",
  "bossmind_marketing_results",
  "bossmind_social_posts",
  "bossmind_publish_verification",
  "bossmind_engagement_analytics",
  "bossmind_campaign_performance",
  "bossmind_marketing_errors",
];

async function repairBossmindHubSchema() {
  const sql = getSqlClient();
  if (!sql) return { ok: false, reason: "no_database" };
  const repairs = [];
  for (const table of TABLES_NEEDING_PROJECT_KEY) {
    try {
      const exists = await sql.query(
        `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1 LIMIT 1`,
        [table]
      );
      if (!exists?.length) continue;
      const cols = await sql.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1`,
        [table]
      );
      const names = new Set((cols || []).map((r) => r.column_name));
      if (!names.has("project_key")) {
        await sql.query(
          `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS project_key TEXT NOT NULL DEFAULT '_global'`
        );
        repairs.push({ table, action: "added_project_key" });
      }
    } catch (e) {
      repairs.push({ table, action: "error", error: e.message });
    }
  }
  return { ok: true, repairs };
}

module.exports = { repairBossmindHubSchema, TABLES_NEEDING_PROJECT_KEY };
