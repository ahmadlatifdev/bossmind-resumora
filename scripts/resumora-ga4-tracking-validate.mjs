#!/usr/bin/env node
/**
 * GA4 tracking readiness — env + live HTML + Neon mirror events.
 *
 *   npm run resumora:ga4:validate
 */
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function arg(name, def = "") {
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (eq) return eq.slice(`--${name}=`.length).trim();
  return def;
}

async function fetchHtml(origin) {
  const res = await fetch(`${origin.replace(/\/$/, "")}/pricing`, {
    headers: { "user-agent": "ResumoraGa4Validate/1.0" },
  });
  return { ok: res.ok, status: res.status, html: await res.text() };
}

async function main() {
  require(path.join(root, "lib/shared/load-project-env.js")).loadProjectEnv(root);
  const origin = arg("origin", process.env.RESUMORA_GOOGLE_AUDIT_ORIGIN || "https://resumora.net");
  const envId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || "";
  const live = await fetchHtml(origin);
  const hasGtag = /googletagmanager\.com\/gtag\/js/i.test(live.html);
  const ids = new Set();
  const m1 = live.html.matchAll(/gtag\(\s*['"]config['"]\s*,\s*['"](G-[A-Z0-9]+)['"]/gi);
  for (const m of m1) ids.add(m[1].toUpperCase());
  const m2 = live.html.matchAll(/googletagmanager\.com\/gtag\/js\?id=(G-[A-Z0-9]+)/gi);
  for (const m of m2) ids.add(m[1].toUpperCase());
  const ga4Ids = [...ids];

  let neon = { ok: false };
  try {
    const n = require(path.join(root, "lib/shared/neon-memory.js"));
    await n.ensureSharedMemoryInitialized().catch(() => {});
    const sql = n.getSqlClient();
    if (sql) {
      const rows = await sql`
        SELECT COUNT(*)::int AS c FROM analytics_web_events
        WHERE created_at > NOW() - INTERVAL '7 days'
      `;
      neon = { ok: true, events7d: rows?.[0]?.c ?? 0 };
    }
  } catch (e) {
    neon = { ok: false, error: e.message };
  }

  const clientEventsWired = [
    "lib/marketing/resumora-ga4-events.js",
    "lib/marketing/client-hooks.js",
    "pages/register.js",
    "pages/chat.js",
  ];

  const report = {
    generatedAt: new Date().toISOString(),
    origin,
    envMeasurementId: envId || null,
    liveGtagScript: hasGtag,
    liveGa4Ids: ga4Ids,
    envMatchesLive: envId ? ga4Ids.includes(envId.toUpperCase()) : false,
    neonAnalytics: neon,
    recommendedEvents: [
      "select_plan",
      "begin_checkout",
      "sign_up",
      "generate_lead",
      "page_view",
    ],
    clientEventsWired,
    pass: Boolean(envId) && hasGtag && ga4Ids.length > 0,
  };

  console.log(JSON.stringify(report, null, 2));
  process.exit(report.pass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
