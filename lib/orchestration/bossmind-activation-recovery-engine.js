/**
 * BossMind Missing/Partial Activation Auto-Recovery Engine.
 * Scans projects vs feature registry; persists tasks to Neon; safe auto-fix only.
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const neon = require("../shared/neon-memory");
const hub = require("../shared/bossmind-hub-memory");

const STATUS = {
  ACTIVE: "ACTIVE",
  PARTIAL: "PARTIAL",
  MISSING: "MISSING",
  BROKEN: "BROKEN",
};

function loadJson(rel) {
  const p = path.join(process.cwd(), rel);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function resolveBossmindRoot() {
  return (
    process.env.BOSSMIND_BOSSMIND_ROOT ||
    process.env.BOSSMIND_ROOT ||
    "D:/BossMind"
  );
}

function resolveProjectRoot(project) {
  if (project.anchorRepo) return process.cwd();
  const root = resolveBossmindRoot();
  return path.join(root, project.repoRelativePath || project.id);
}

function repoPresent(projectRoot) {
  return fs.existsSync(projectRoot) && fs.existsSync(path.join(projectRoot, "package.json"));
}

function scoreFromFeatures(features) {
  if (!features.length) return 0;
  const weights = { ACTIVE: 100, PARTIAL: 55, MISSING: 0, BROKEN: 15 };
  const sum = features.reduce((a, f) => a + (weights[f.status] || 0), 0);
  return Math.round(sum / features.length);
}

async function probeLiveHealth(url) {
  if (!url) return { status: STATUS.MISSING, detail: "no_production_url" };
  const origin = url.replace(/\/$/, "");
  try {
    const res = await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(25000) });
    const body = await res.json().catch(() => ({}));
    if (body.database?.ok) return { status: STATUS.ACTIVE, detail: "live_db_ok", body };
    if (body.database?.configured === false) {
      return { status: STATUS.BROKEN, detail: "live_db_missing_env", body };
    }
    return { status: STATUS.PARTIAL, detail: `live_health_${res.status}`, body };
  } catch (e) {
    return { status: STATUS.BROKEN, detail: e.message || "live_probe_failed" };
  }
}

function scanResumoraLocal(projectRoot) {
  const results = {};
  const root = projectRoot;

  try {
    require(path.join(process.cwd(), "lib/shared/load-project-env.js")).loadProjectEnv(process.cwd());
    const { probeDatabaseConnection } = require("../shared/neon-memory");
    results.database = async () => {
      const p = await probeDatabaseConnection();
      return p.ok
        ? { status: STATUS.ACTIVE, detail: p.source }
        : { status: STATUS.BROKEN, detail: p.reason || "db_failed" };
    };
  } catch {
    results.database = async () => ({ status: STATUS.BROKEN, detail: "db_module_error" });
  }

  results.registration = async () => {
    const p = path.join(root, "pages/api/engagement/register.js");
    if (!fs.existsSync(p)) return { status: STATUS.MISSING, detail: "route_missing" };
    const { requireDatabaseReady } = require("../shared/require-database");
    const gate = await requireDatabaseReady();
    return gate.ok
      ? { status: STATUS.ACTIVE, detail: "local_register_ready" }
      : { status: STATUS.BROKEN, detail: gate.body?.reason || "db_gate" };
  };

  results.login_sessions = async () => {
    const p = path.join(root, "pages/api/engagement/login.js");
    if (!fs.existsSync(p)) return { status: STATUS.MISSING, detail: "route_missing" };
    return { status: STATUS.ACTIVE, detail: "login_route_present" };
  };

  results.stripe_checkout = async () => {
    const { auditStripeEnv } = require("../marketing/stripe-env-audit");
    const a = auditStripeEnv();
    return a.checkoutReady
      ? { status: STATUS.ACTIVE, detail: a.sandboxLiveConsistent?.mode || "configured" }
      : { status: STATUS.PARTIAL, detail: "stripe_checkout_incomplete" };
  };

  results.stripe_webhooks = async () => {
    const { auditStripeEnv } = require("../marketing/stripe-env-audit");
    const a = auditStripeEnv();
    if (!fs.existsSync(path.join(root, "pages/api/webhooks/stripe.js"))) {
      return { status: STATUS.MISSING, detail: "webhook_route_missing" };
    }
    return a.webhookSigningReady
      ? { status: STATUS.ACTIVE, detail: "webhook_ready" }
      : { status: STATUS.PARTIAL, detail: "webhook_secret_missing" };
  };

  results.payment_links = async () => {
    const lock = path.join(root, "config/resumora-stripe-payment-links-lock.json");
    if (!fs.existsSync(lock)) return { status: STATUS.MISSING, detail: "manifest_missing" };
    const m = JSON.parse(fs.readFileSync(lock, "utf8"));
    const plans = ["basic", "professional", "elite", "essential_advanced"];
    const ok = plans.every((id) => m.planRoutes?.[id]?.paymentLinkUrl);
    return ok ? { status: STATUS.ACTIVE, detail: "four_plans_linked" } : { status: STATUS.PARTIAL, detail: "incomplete_routes" };
  };

  results.post_payment = async () => {
    const ok =
      fs.existsSync(path.join(root, "pages/api/verify-session.js")) &&
      fs.existsSync(path.join(root, "lib/client/post-purchase-provision.js"));
    return ok ? { status: STATUS.ACTIVE, detail: "provision_wired" } : { status: STATUS.MISSING, detail: "provision_missing" };
  };

  results.client_dashboard = async () => {
    const ok =
      fs.existsSync(path.join(root, "pages/studio/index.js")) &&
      fs.existsSync(path.join(root, "pages/api/client/hub.js"));
    return ok ? { status: STATUS.ACTIVE, detail: "hub_present" } : { status: STATUS.PARTIAL, detail: "hub_incomplete" };
  };

  results.plans_four_tier = async () => {
    const { auditPlansRuntime } = require("../shared/plans-runtime-sync");
    const a = auditPlansRuntime();
    return a.ok ? { status: STATUS.ACTIVE, detail: "plans_synced" } : { status: STATUS.PARTIAL, detail: "plans_incomplete" };
  };

  results.en_fr = async () => {
    const siteCopy = path.join(root, "lib/marketing/site-copy.js");
    if (!fs.existsSync(siteCopy)) return { status: STATUS.MISSING, detail: "site_copy_missing" };
    const t = fs.readFileSync(siteCopy, "utf8");
    const hasEn = t.includes("en: {");
    const hasFr = t.includes("fr: {");
    const hasEaFr = t.includes("eaStudioTitle") && t.includes("Studio entretien");
    return hasEn && hasFr && hasEaFr
      ? { status: STATUS.ACTIVE, detail: "bilingual_markers" }
      : { status: STATUS.PARTIAL, detail: "i18n_incomplete" };
  };

  results.premium_interview_prep = async () => {
    try {
      const { getInterviewPrepCatalog } = require("../essential-advanced/interview-prep-content");
      const c = getInterviewPrepCatalog("en");
      const ok = c.counts.qa >= 50 && c.counts.tips >= 20 && c.counts.videos === 3;
      return ok ? { status: STATUS.ACTIVE, detail: `qa=${c.counts.qa}` } : { status: STATUS.PARTIAL, detail: "content_low" };
    } catch {
      return { status: STATUS.MISSING, detail: "module_missing" };
    }
  };

  results.protected_ui = async () => {
    const p = path.join(root, "config/bossmind-protected-ui-authority.json");
    return fs.existsSync(p) ? { status: STATUS.ACTIVE, detail: "authority_locked" } : { status: STATUS.MISSING, detail: "no_authority" };
  };

  results.api_routes = async () => {
    const registry = loadJson("config/bossmind-activation-recovery-registry.json");
    const required = registry?.resumoraCriticalRoutes || [];
    const missing = required.filter((r) => !fs.existsSync(path.join(root, r)));
    return missing.length === 0
      ? { status: STATUS.ACTIVE, detail: `${required.length}_routes` }
      : { status: STATUS.BROKEN, detail: `missing_${missing.length}` };
  };

  results.live_health = async () => {
    const registry = loadJson("config/bossmind-activation-recovery-registry.json");
    const proj = (registry?.projects || []).find((p) => p.id === "resumora");
    return probeLiveHealth(proj?.productionUrl || process.env.BOSSMIND_REALITY_LIVE_URL);
  };

  return results;
}

function scanSiblingGeneric(project, projectRoot) {
  const scanners = {};

  scanners.database = async () => {
    if (!repoPresent(projectRoot)) return { status: STATUS.MISSING, detail: "repo_not_mounted" };
    return { status: STATUS.PARTIAL, detail: "sibling_scan_needs_env_on_host" };
  };

  scanners.api_routes = async () => {
    if (!repoPresent(projectRoot)) return { status: STATUS.MISSING, detail: "repo_not_mounted" };
    const apiDir = path.join(projectRoot, "pages", "api");
    if (!fs.existsSync(apiDir)) {
      const alt = path.join(projectRoot, "src", "app", "api");
      return fs.existsSync(alt)
        ? { status: STATUS.PARTIAL, detail: "app_router_api" }
        : { status: STATUS.PARTIAL, detail: "api_dir_unknown" };
    }
    const count = fs.readdirSync(apiDir, { recursive: true }).filter((f) => String(f).endsWith(".js")).length;
    return count > 0 ? { status: STATUS.PARTIAL, detail: `api_files_${count}` } : { status: STATUS.MISSING, detail: "no_api" };
  };

  scanners.live_health = async () => probeLiveHealth(project.productionUrl);

  scanners.en_fr = async () => {
    if (!repoPresent(projectRoot)) return { status: STATUS.MISSING, detail: "repo_not_mounted" };
    return { status: STATUS.PARTIAL, detail: "manual_i18n_verify" };
  };

  scanners.stripe_checkout = async () => {
    if (!repoPresent(projectRoot)) return { status: STATUS.MISSING, detail: "repo_not_mounted" };
    return { status: STATUS.PARTIAL, detail: "sibling_stripe_verify" };
  };

  scanners.post_payment = scanners.stripe_checkout;
  scanners.registration = scanners.database;
  scanners.login_sessions = scanners.database;

  return scanners;
}

async function runSafeFix(fixId, policy) {
  const fix = (policy.safeAutoFixes || []).find((f) => f.id === fixId);
  if (!fix) return { ok: false, error: "unknown_fix" };
  const script = path.join(process.cwd(), "scripts", fix.script);
  if (!fs.existsSync(script)) return { ok: false, error: "script_missing" };
  const r = spawnSync(process.execPath, [script], {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: 120000,
  });
  return { ok: r.status === 0, exitCode: r.status, stdout: (r.stdout || "").slice(0, 500) };
}

async function persistScanResults({ projectKey, features, healthScore, writerAgent }) {
  await neon.ensureEngagementSchema().catch(() => {});
  await hub.ensureBossmindHubMemoryInitialized().catch(() => {});

  for (const f of features) {
    if (f.status === STATUS.ACTIVE) continue;
    const taskKey = `activation_repair:${f.id}`;
    await neon.upsertTaskState({
      projectKey,
      taskKey,
      status: f.safeFix ? "pending_auto" : "pending_approval",
      assignedAgent: writerAgent,
      payload: {
        featureId: f.id,
        status: f.status,
        detail: f.detail,
        safeFix: f.safeFix || null,
        escalated: !f.safeFix,
      },
    }).catch(() => {});

    await neon.saveMissingUpdate({
      projectKey,
      taskKey,
      reason: `activation_${f.status.toLowerCase()}:${f.id}`,
      payload: { detail: f.detail, healthScore },
    }).catch(() => {});
  }

  await neon.saveEvent({
    projectKey,
    eventType: "bossmind.activation_recovery.scan",
    severity: features.some((f) => f.status === STATUS.BROKEN) ? "warn" : "info",
    source: "activation-recovery-engine",
    payload: {
      healthScore,
      summary: features.reduce((acc, f) => {
        acc[f.status] = (acc[f.status] || 0) + 1;
        return acc;
      }, {}),
    },
  }).catch(() => {});

  await hub.upsertBossmindMemory({
    projectKey: "_global",
    memoryKey: `activation_recovery:${projectKey}`,
    memoryType: "ACTIVATION_RECOVERY_SNAPSHOT",
    payload: {
      healthScore,
      scannedAt: new Date().toISOString(),
      features,
    },
    writerAgent,
  }).catch(() => {});
}

function suggestSafeFix(featureId, projectId, policy) {
  if (projectId !== "resumora") return null;
  if (featureId === "database" || featureId === "registration" || featureId === "live_health") {
    return "sync_hub_database_env";
  }
  if (featureId === "stripe_checkout" || featureId === "payment_links") {
    return "sync_hub_stripe_prices";
  }
  if (featureId === "live_health") return "render_env_bundle";
  const allowed = new Set((policy.safeAutoFixes || []).map((f) => f.id));
  return allowed.has("render_env_bundle") ? "render_env_bundle" : null;
}

async function scanProject(project, registry, policy, { liveProbe = true } = {}) {
  const projectRoot = resolveProjectRoot(project);
  const featureIds = registry.projectFeatures[project.id] || [];
  const scanners =
    project.id === "resumora" && project.anchorRepo
      ? scanResumoraLocal(projectRoot)
      : scanSiblingGeneric(project, projectRoot);

  const features = [];
  for (const featureId of featureIds) {
    let result;
    if (featureId === "live_health" && liveProbe) {
      result = await probeLiveHealth(project.productionUrl);
    } else if (scanners[featureId]) {
      result = await scanners[featureId]();
    } else {
      result = { status: STATUS.PARTIAL, detail: "scanner_not_implemented" };
    }
    const safeFix = result.status !== STATUS.ACTIVE ? suggestSafeFix(featureId, project.id, policy) : null;
    features.push({
      id: featureId,
      label: (registry.featureCatalog || []).find((f) => f.id === featureId)?.label || featureId,
      status: result.status,
      detail: result.detail,
      safeFix,
    });
  }

  const healthScore = scoreFromFeatures(features);
  const repoOk = project.anchorRepo || repoPresent(projectRoot);

  return {
    projectId: project.id,
    displayName: project.displayName,
    productionUrl: project.productionUrl,
    repoPresent: repoOk,
    projectRoot: repoOk ? projectRoot : null,
    healthScore,
    features,
  };
}

async function runActivationRecovery({
  writerAgent = "recovery_agent",
  applySafe = false,
  liveProbe = true,
  lock = false,
  notes = "",
} = {}) {
  const registry = loadJson("config/bossmind-activation-recovery-registry.json");
  const policy = loadJson("config/bossmind-activation-recovery-policy.json");
  if (!registry) return { ok: false, error: "registry_missing" };

  const projectReports = [];
  const safeFixResults = [];

  for (const project of registry.projects) {
    const report = await scanProject(project, registry, policy, { liveProbe });
    projectReports.push(report);
    await persistScanResults({
      projectKey: project.id,
      features: report.features,
      healthScore: report.healthScore,
      writerAgent,
    });

    if (applySafe && project.id === "resumora") {
      const fixes = new Set(
        report.features.filter((f) => f.safeFix && f.status !== STATUS.ACTIVE).map((f) => f.safeFix)
      );
      for (const fixId of fixes) {
        const r = await runSafeFix(fixId, policy);
        safeFixResults.push({ projectId: project.id, fixId, ...r });
      }
    }
  }

  const overallScore =
    projectReports.length === 0
      ? 0
      : Math.round(
          projectReports.reduce((a, p) => a + p.healthScore, 0) / projectReports.length
        );

  const escalation = [];
  for (const p of projectReports) {
    for (const f of p.features) {
      if (f.status !== STATUS.ACTIVE && !f.safeFix) {
        escalation.push({
          projectId: p.projectId,
          featureId: f.id,
          status: f.status,
          detail: f.detail,
        });
      }
    }
  }

  const report = {
    ok: escalation.length === 0 && projectReports.every((p) => p.healthScore >= 80),
    generatedAt: new Date().toISOString(),
    overallHealthScore: overallScore,
    projects: projectReports,
    safeFixResults,
    escalation,
    notes: String(notes).slice(0, 2000),
  };

  if (lock && neon.getSqlClient()) {
    try {
      await neon.upsertLastConfirmedCheckpoint({
        projectKey: "_global",
        checkpointKey: "bossmind_activation_recovery",
        payload: {
          overallHealthScore: overallScore,
          projects: projectReports.map((p) => ({
            id: p.projectId,
            healthScore: p.healthScore,
          })),
          lockedAt: report.generatedAt,
        },
        source: "bossmind-activation-recovery",
        locked: report.ok,
      });
    } catch (e) {
      report.checkpointSkipped = e.message;
    }
  }

  return report;
}

module.exports = {
  STATUS,
  runActivationRecovery,
  scanProject,
  scoreFromFeatures,
};
