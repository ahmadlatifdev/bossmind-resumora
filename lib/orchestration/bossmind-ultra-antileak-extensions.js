/**
 * Ultra Anti-Leak extensions — restore, extended deploy guard, DOM/visual structural validation, self-heal.
 */
const fs = require("fs");
const path = require("path");
const { execSync, spawnSync } = require("child_process");
const { structuralAuthorityReport } = require("./bossmind-interface-authority.js");

function computeDomStructuralHash(html) {
  const signals = [
    (html.match(/data-tier="[^"]+"/g) || []).sort().join("|"),
    (html.match(/data-rs-pricing-ui="[^"]+"/g) || []).join("|"),
    html.includes("rs-pricing-grid") ? "grid:1" : "grid:0",
    html.includes("rs-trust-panel") ? "trust:1" : "trust:0",
    (html.match(/rs-price-card/g) || []).length,
    html.includes("Essential Advanced") ? "ea:1" : "ea:0",
    html.includes("--rs-gold:") ? "theme:1" : "theme:0",
  ];
  const crypto = require("crypto");
  return crypto.createHash("sha256").update(signals.join("\n"), "utf8").digest("hex").slice(0, 16);
}

function runVisualStructuralValidation(homeHtml, pricingHtml, policy) {
  const checks = [
    { id: "no_trust_panel", pass: !homeHtml.includes("rs-trust-panel--slim") },
    { id: "four_price_cards", pass: (homeHtml.match(/data-tier="/g) || []).length >= 4 },
    { id: "pricing_grid", pass: homeHtml.includes("rs-pricing-grid") },
    { id: "luxury_theme_tokens", pass: homeHtml.includes("--rs-gold:") && homeHtml.includes("--rs-bg-deep:") },
    { id: "select_plan_buttons", pass: (homeHtml.match(/rs-price-btn/g) || []).length >= 4 },
    { id: "no_center_install_overlap", pass: !homeHtml.includes("rs-install-banner--legacy") },
    { id: "pricing_page_ea", pass: pricingHtml.includes("essential_advanced") || pricingHtml.includes("Essential Advanced") },
    {
      id: "pricing_ui_marker",
      pass: homeHtml.includes(`data-rs-pricing-ui="${policy.pricingUiMarker}"`) || pricingHtml.includes(`data-rs-pricing-ui="${policy.pricingUiMarker}"`),
    },
  ];
  const passCount = checks.filter((c) => c.pass).length;
  return {
    pass: passCount >= checks.length - 1,
    score: Math.round((passCount / checks.length) * 100),
    checks,
    homeDomHash: computeDomStructuralHash(homeHtml),
    pricingDomHash: computeDomStructuralHash(pricingHtml),
  };
}

function getGitHead(cwd) {
  try {
    return execSync("git rev-parse HEAD", { cwd, encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

function readBuildId(cwd) {
  try {
    const p = path.join(cwd, ".next", "BUILD_ID");
    if (fs.existsSync(p)) return fs.readFileSync(p, "utf8").trim();
  } catch {
    /* ignore */
  }
  return null;
}

function compareDeploymentLayers(cwd, sourceHash, liveDomHash, origin) {
  const gitHead = getGitHead(cwd);
  const buildId = readBuildId(cwd);
  return {
    gitHead: gitHead || null,
    buildId,
    sourceFingerprintHash: sourceHash,
    liveDomStructuralHash: liveDomHash,
    origin: origin || null,
    note: "Full GitHub↔deploy commit match requires CI metadata (RENDER_GIT_COMMIT / Railway). In-repo compares source files vs live DOM structure.",
  };
}

function runExtendedDeployGuard(cwd) {
  const checks = [];
  const homePath = path.join(cwd, "components/marketing/HomePage.jsx");
  const home = fs.existsSync(homePath) ? fs.readFileSync(homePath, "utf8") : "";
  checks.push({
    id: "home_no_trust_import",
    pass: !home.includes("TrustMetricsPanel"),
  });
  checks.push({
    id: "pricing_panel_marker",
    pass: fs.existsSync(path.join(cwd, "components/marketing/sections/PricingPanel.jsx")) &&
      fs.readFileSync(path.join(cwd, "components/marketing/sections/PricingPanel.jsx"), "utf8").includes("data-rs-pricing-ui"),
  });
  checks.push({
    id: "trust_stub_noop",
    pass: fs.readFileSync(path.join(cwd, "components/marketing/sections/TrustMetricsPanel.jsx"), "utf8").includes("return null"),
  });
  const structural = structuralAuthorityReport(cwd);
  checks.push({ id: "single_home_authority", pass: structural.ok });
  const routes = ["pages/pricing.js", "pages/index.js", "pages/services.js"];
  for (const r of routes) {
    checks.push({ id: `route_${r}`, pass: fs.existsSync(path.join(cwd, r)) });
  }
  const siteCopy = fs.readFileSync(path.join(cwd, "lib/marketing/site-copy.js"), "utf8");
  checks.push({
    id: "essential_advanced_in_plans",
    pass: /id:\s*"essential_advanced"/.test(siteCopy),
  });
  const globalCss = fs.readFileSync(path.join(cwd, "styles/resumora-global.css"), "utf8");
  checks.push({
    id: "four_column_pricing_grid",
    pass: globalCss.includes("repeat(4,") || globalCss.includes("repeat(4, "),
  });
  checks.push({
    id: "checkout_api_essential",
    pass: fs.readFileSync(path.join(cwd, "pages/api/checkout.js"), "utf8").includes("essential_advanced"),
  });
  const passCount = checks.filter((c) => c.pass).length;
  return {
    ok: passCount === checks.length,
    score: Math.round((passCount / checks.length) * 100),
    checks,
  };
}

function restoreGoldenSnapshot(cwd, { snapshotId, dryRun = false } = {}) {
  const goldenPath = path.join(cwd, ".bossmind", "anti-leak", "golden-snapshot.json");
  if (!fs.existsSync(goldenPath)) return { ok: false, reason: "no_golden_snapshot" };
  const golden = JSON.parse(fs.readFileSync(goldenPath, "utf8"));
  const id = snapshotId || golden.snapshotId;
  const snapBase = golden.path
    ? path.join(cwd, golden.path.replace(/^\//, ""))
    : path.join(cwd, ".bossmind", "anti-leak", "snapshots", id);
  const manifestPath = path.join(snapBase, "manifest.json");
  if (!fs.existsSync(manifestPath)) return { ok: false, reason: "snapshot_manifest_missing", snapshotId: id };

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const restored = [];
  for (const f of manifest.files || []) {
    const src = path.join(snapBase, f.relativePath);
    const dest = path.join(cwd, f.relativePath);
    if (!fs.existsSync(src)) continue;
    if (!dryRun) {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(src, dest);
    }
    restored.push(f.relativePath);
  }
  return {
    ok: restored.length > 0,
    snapshotId: id,
    restored,
    dryRun,
    aggregateChecksum: manifest.aggregateChecksum,
  };
}

function runSpawnScript(root, scriptRel, args = []) {
  const res = spawnSync(process.execPath, [path.join(root, scriptRel), ...args], {
    cwd: root,
    encoding: "utf8",
    stdio: "pipe",
    maxBuffer: 16 * 1024 * 1024,
  });
  return { ok: (res.status ?? 1) === 0, code: res.status ?? 1, stderr: (res.stderr || "").slice(-3000) };
}

async function runSelfHealPipeline(cwd, origin, { restoreSnapshot = false } = {}) {
  const actions = [];
  actions.push({ step: "clean_next_cache", ...runSpawnScript(cwd, "scripts/clean-next-cache.mjs") });

  if (restoreSnapshot) {
    const restored = restoreGoldenSnapshot(cwd);
    actions.push({ step: "restore_golden_snapshot", ok: restored.ok, detail: restored });
  }

  actions.push({ step: "runtime_sync_once", ...runSpawnScript(cwd, "scripts/bossmind-runtime-sync.mjs", ["--once"]) });

  let neonEvent = { skipped: true };
  try {
    const neon = require("../shared/neon-memory.js");
    await neon.ensureSharedMemoryInitialized().catch(() => {});
    if (neon.getSqlClient()) {
      await neon.saveEvent({
        projectKey: process.env.BOSSMIND_PROJECT_KEY || "resumora",
        eventType: "bossmind.ultra_antileak.self_heal",
        severity: "info",
        source: "bossmind-ultra-antileak-self-heal",
        eventKey: `heal:${Date.now()}`,
        payload: { origin, actions: actions.map((a) => ({ step: a.step, ok: a.ok })) },
      });
      neonEvent = { ok: true };
    }
  } catch (e) {
    neonEvent = { ok: false, error: e.message };
  }

  return {
    ok: actions.every((a) => a.ok !== false),
    actions,
    neonEvent,
  };
}

async function notifyRedeployHook(origin, reason) {
  const url = process.env.BOSSMIND_RECONCILE_DEPLOY_HOOK_URL || process.env.BOSSMIND_ULTRA_REDEPLOY_HOOK_URL;
  if (!url) return { skipped: true, reason: "no_hook_url" };
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": "BossMind-Ultra-AntiLeak/1.0" },
      body: JSON.stringify({ event: "bossmind.ultra_antileak.redeploy_signal", origin, reason, at: new Date().toISOString() }),
    });
    return { ok: res.ok, status: res.status };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

module.exports = {
  computeDomStructuralHash,
  runVisualStructuralValidation,
  compareDeploymentLayers,
  runExtendedDeployGuard,
  restoreGoldenSnapshot,
  runSelfHealPipeline,
  notifyRedeployHook,
};
