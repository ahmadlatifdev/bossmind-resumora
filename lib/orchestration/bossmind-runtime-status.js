const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const neon = require("../shared/neon-memory");
const { loadRolePolicy } = require("./bossmind-role-policy");
const { auditStripeEnv } = require("../marketing/stripe-env-audit");

async function summarizeBundleHeavyChunks(cwd = process.cwd(), maxChunks = 12) {
  const staticRoot = path.join(cwd, ".next", "static");
  const chunks = [];
  if (!fs.existsSync(staticRoot)) {
    return { scanned: false, chunks };
  }

  function walk(dir) {
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".js") || e.name.endsWith(".css")) {
        try {
          const st = fs.statSync(p);
          chunks.push({ rel: path.relative(cwd, p), bytes: st.size });
        } catch {
          /* ignore */
        }
      }
    }
  }
  walk(staticRoot);
  chunks.sort((a, b) => b.bytes - a.bytes);
  return { scanned: true, chunks: chunks.slice(0, maxChunks) };
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderOverviewHtml(overview) {
  const mem = overview.process?.memory || {};
  const mb = (n) => (Number(n) / (1024 * 1024)).toFixed(1);
  const rows = (overview.neon?.events || [])
    .slice(0, 15)
    .map(
      (e) =>
        `<tr><td>${escapeHtml(e.created_at || "")}</td><td>${escapeHtml(e.event_type || "")}</td><td>${escapeHtml(
          e.severity || ""
        )}</td><td>${escapeHtml(e.source || "")}</td></tr>`
    )
    .join("");
  const tasks = (overview.neon?.tasks || [])
    .slice(0, 12)
    .map(
      (t) =>
        `<tr><td>${escapeHtml(t.task_key || "")}</td><td>${escapeHtml(t.status || "")}</td><td>${escapeHtml(
          t.assigned_agent || ""
        )}</td></tr>`
    )
    .join("");
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><title>BossMind ops</title>
<style>body{font-family:system-ui,sans-serif;margin:24px;background:#0b0f14;color:#e6edf3} table{border-collapse:collapse;width:100%;margin:16px 0} th,td{border:1px solid #30363d;padding:6px 8px;font-size:13px} th{background:#161b22;text-align:left} .muted{color:#8b949e} .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px}</style></head><body>
<h1>BossMind runtime / orchestration</h1>
<p class="muted">Internal read-only view. Protect with <code>BOSSMIND_ORCHESTRATION_SECRET</code>.</p>
<div class="grid">
<div><strong>Commit</strong><br/>${escapeHtml(overview.git?.head || "n/a")}</div>
<div><strong>BUILD_ID</strong><br/>${escapeHtml(overview.build?.buildId || "n/a")}</div>
<div><strong>Uptime (s)</strong><br/>${escapeHtml(String(overview.process?.uptime?.toFixed?.(1) ?? "n/a"))}</div>
<div><strong>RSS (MB)</strong><br/>${escapeHtml(mb(mem.rss || 0))}</div>
<div><strong>Heap used (MB)</strong><br/>${escapeHtml(mb(mem.heapUsed || 0))}</div>
<div><strong>Neon</strong><br/>${overview.env?.neon ? "connected" : "offline"}</div>
<div><strong>Stripe key</strong><br/>${overview.env?.stripe ? "set" : "missing"}</div>
<div><strong>DeepSeek</strong><br/>${overview.env?.deepseek ? "set" : "missing"}</div>
</div>
<h2 class="muted">Largest .next static assets</h2>
<pre>${escapeHtml(JSON.stringify(overview.performance?.bundleTop || [], null, 2))}</pre>
<h2 class="muted">Recent events</h2>
<table><thead><tr><th>When</th><th>Type</th><th>Sev</th><th>Source</th></tr></thead><tbody>${rows || "<tr><td colspan=4>No rows</td></tr>"}</tbody></table>
<h2 class="muted">Task queue (recent)</h2>
<table><thead><tr><th>Task</th><th>Status</th><th>Agent</th></tr></thead><tbody>${tasks || "<tr><td colspan=3>No rows</td></tr>"}</tbody></table>
</body></html>`;
}

async function getBossMindRuntimeOverview({ projectKey, neonEnabled }) {
  const cwd = process.cwd();
  const overview = {
    ts: Date.now(),
    process: {
      pid: process.pid,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
    },
    env: {
      nodeEnv: process.env.NODE_ENV || "development",
      railway: Boolean(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_ENVIRONMENT_NAME),
      deepseek: Boolean(process.env.DEEPSEEK_API_KEY),
      stripe: Boolean(process.env.STRIPE_SECRET_KEY),
      orchestrationSecret: Boolean(process.env.BOSSMIND_ORCHESTRATION_SECRET),
      neon: Boolean(neonEnabled),
    },
    git: { head: null },
    build: {
      buildId: null,
      nextDirExists: fs.existsSync(path.join(cwd, ".next")),
    },
    neon: {
      events: [],
      tasks: [],
      rollbacks: [],
      missingUpdatesSample: [],
      deploymentSample: [],
    },
    performance: {},
    policy: {},
  };

  const rolePolicy = loadRolePolicy();
  overview.policy = {
    loaded: rolePolicy.loaded,
    path: rolePolicy.path,
    reason: rolePolicy.reason,
    roleStructure: rolePolicy.policy?.enforcement || null,
  };

  try {
    overview.git.head = execSync("git rev-parse HEAD", { encoding: "utf8", cwd }).trim();
  } catch {
    overview.git.head = null;
  }

  try {
    const bid = path.join(cwd, ".next", "BUILD_ID");
    if (fs.existsSync(bid)) {
      overview.build.buildId = fs.readFileSync(bid, "utf8").trim();
    }
  } catch {
    /* ignore */
  }

  const bundle = await summarizeBundleHeavyChunks(cwd);
  overview.performance.bundleTop = bundle.chunks;
  overview.performance.bundleScanned = bundle.scanned;

  const stripeAudit = auditStripeEnv();
  overview.stripeIntegration = {
    checkoutReady: stripeAudit.checkoutReady,
    webhookSigningReady: stripeAudit.webhookSigningReady,
    financialPipelineReady: stripeAudit.financialPipelineReady,
    pricePlans: stripeAudit.priceIds,
  };

  if (neonEnabled) {
    await neon.initializeSharedMemory();
    const sql = neon.getSqlClient();
    if (sql) {
      const [events, tasks, rollbacks, missing, deploy] = await Promise.all([
        neon.listRecentEvents({ projectKey, limit: 30 }),
        neon.listRecentTaskStates({ projectKey, limit: 30 }),
        neon.listLatestRollbackSnapshots({ projectKey, limit: 20 }),
        sql(
          `SELECT id, task_key, reason, created_at FROM missing_updates_log
           WHERE project_key = $1 ORDER BY created_at DESC LIMIT 10`,
          [projectKey]
        ),
        sql(
          `SELECT id, commit_hash, environment, status, summary, created_at FROM deployment_history
           WHERE project_key = $1 ORDER BY created_at DESC LIMIT 8`,
          [projectKey]
        ),
      ]);
      overview.neon.events = events;
      overview.neon.tasks = tasks;
      overview.neon.rollbacks = rollbacks;
      overview.neon.missingUpdatesSample = missing || [];
      overview.neon.deploymentSample = deploy || [];
    }
  }

  return overview;
}

module.exports = {
  getBossMindRuntimeOverview,
  renderOverviewHtml,
  summarizeBundleHeavyChunks,
};
