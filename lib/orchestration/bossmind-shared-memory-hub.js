/**
 * BossMind One Shared Memory Hub — load context, enforce rules, run Master Admin shortcuts.
 * READ: all registered projects + agents. WRITE: approved orchestrator agents only.
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const hub = require("../shared/bossmind-hub-memory");
const neon = require("../shared/neon-memory");
const { loadOrganicGrowthRegistry } = require("../marketing/bossmind-organic-growth-registry");

const WRITE_AGENTS = new Set([
  "bossmind_orchestrator",
  "recovery_agent",
  "deployment_verifier",
  "memory_sync_job",
  "master_admin_shortcut",
]);

const SHORTCUTS = [
  { id: "load_locked_state", label: "Load Latest Locked State", steps: 1 },
  { id: "apply_safety_rules", label: "Apply Shared Safety Rules", steps: 1 },
  { id: "apply_marketing_rules", label: "Apply Shared Marketing Rules", steps: 1 },
  { id: "scan_errors", label: "Scan Errors From Shared Memory", steps: 1 },
  { id: "fix_from_error_memory", label: "Fix From Error Memory", steps: 1 },
  { id: "verify_design_lock", label: "Verify Design Lock", steps: 1 },
  { id: "run_preflight", label: "Run Preflight", steps: 1 },
  { id: "build_safe", label: "Build Safe", steps: 1 },
  { id: "deploy_safe", label: "Deploy Safe", steps: 1 },
  { id: "verify_live", label: "Verify Live", steps: 1 },
  { id: "save_snapshot", label: "Save New Snapshot", steps: 1 },
  { id: "publish_organic_posts", label: "Publish Organic Posts", steps: 1 },
  { id: "run_autonomous_marketing", label: "Run Autonomous Marketing Engine", steps: 8 },
  { id: "run_runtime_authority", label: "Run Runtime Authority", steps: 6 },
  { id: "run_visual_verification", label: "Run Visual Verification", steps: 1 },
  { id: "validate_production_truth", label: "Validate Production Truth", steps: 1 },
  { id: "trigger_rollback", label: "Trigger Rollback", steps: 1 },
  {
    id: "stripe_dashboard_repair",
    label: "BossMind → Recovery → Stripe Dashboard Repair",
    steps: 4,
  },
  {
    id: "stripe_brand_sync",
    label: "BossMind → Brand → Stripe Catalog Sync",
    steps: 2,
  },
  {
    id: "stripe_session_repair",
    label: "BossMind → Recovery → Stripe Dashboard Repair (legacy)",
    steps: 4,
  },
];

function loadJson(relPath) {
  const p = path.join(process.cwd(), relPath);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function canWrite(writerAgent) {
  return WRITE_AGENTS.has(String(writerAgent || "").trim());
}

function resolveProject(projectKey) {
  const strategy = loadJson("config/bossmind-shared-memory-strategy.json");
  const organic = loadOrganicGrowthRegistry(process.cwd());
  const fromStrategy = strategy?.projects?.find((p) => p.id === projectKey);
  const fromOrganic = organic?.projects?.find((p) => p.id === projectKey);
  return {
    projectKey,
    strategy: fromStrategy || null,
    organic: fromOrganic || null,
    productionUrl:
      fromStrategy?.productionUrl || fromOrganic?.siteUrl || process.env.BOSSMIND_IMMUTABLE_PROBE_ORIGIN || null,
  };
}

async function seedRulesFromConfig({ writerAgent = "bossmind_orchestrator" } = {}) {
  if (!canWrite(writerAgent)) {
    return { ok: false, error: "write_not_allowed", writerAgent };
  }
  await hub.ensureBossmindHubMemoryInitialized();
  const safety = loadJson("config/bossmind-safety-rules.json");
  const marketing = loadJson("config/bossmind-marketing-rules.json");
  let safetyCount = 0;
  let marketingCount = 0;
  for (const r of safety?.rules || []) {
    await hub.upsertSafetyRule({
      ruleId: r.id,
      ruleText: r.text,
      severity: r.severity,
      active: true,
      payload: r,
    });
    safetyCount += 1;
  }
  for (const r of marketing?.rules || []) {
    await hub.upsertMarketingRule({
      ruleId: r.id,
      ruleText: r.text,
      severity: r.severity,
      active: true,
      payload: r,
    });
    marketingCount += 1;
  }
  await hub.upsertBossmindMemory({
    projectKey: "_global",
    memoryKey: "rules_seeded_at",
    memoryType: "meta",
    payload: { safetyCount, marketingCount, at: new Date().toISOString() },
    writerAgent,
  });
  return { ok: true, safetyCount, marketingCount };
}

async function loadProjectContext(projectKey, { writerAgent = "read_only" } = {}) {
  await neon.ensureSharedMemoryInitialized();
  await hub.ensureBossmindHubMemoryInitialized();
  const project = resolveProject(projectKey);
  const cwd = process.cwd();

  let baselineHash = null;
  try {
    const baseline = loadJson("config/bossmind-immutable-production-baseline.json");
    baselineHash = baseline?.lockedLuxuryInterfaceFingerprint || null;
  } catch {
    /* ignore */
  }

  const [safetyRules, marketingRules, projectLocks, designSnapshot, errors, deployVerifications, memoryRows] =
    await Promise.all([
      hub.listSafetyRules(),
      hub.listMarketingRules(),
      hub.listProjectLocks({ projectKey }),
      hub.getLatestDesignSnapshot({ projectKey }),
      neon.listKnownErrors({ projectKey, limit: 25 }),
      hub.listDeployVerifications({ projectKey, limit: 10 }),
      hub.listBossmindMemory({ projectKey, limit: 30 }),
    ]);

  const checkpoint = await neon.getLastConfirmedCheckpoint({
    projectKey,
    checkpointKey: "immutable_ui_execution_lock",
  }).catch(() => null);

  return {
    ok: true,
    projectKey,
    project,
    baselineHash,
    safetyRules: safetyRules.length ? safetyRules : loadJson("config/bossmind-safety-rules.json")?.rules || [],
    marketingRules: marketingRules.length ? marketingRules : loadJson("config/bossmind-marketing-rules.json")?.rules || [],
    projectLocks,
    designSnapshot,
    checkpoint,
    errorMemory: errors,
    deployVerifications,
    memoryRows,
    shortcuts: SHORTCUTS,
    accessPolicy: loadJson("config/bossmind-shared-memory-strategy.json")?.accessPolicy || null,
    readOnly: !canWrite(writerAgent),
  };
}

function evaluateChangeAgainstRules(change, context) {
  const violations = [];
  const safety = context.safetyRules || [];
  const targetProject = change?.targetProject || context.projectKey;
  const sourceProject = change?.sourceProject || context.projectKey;

  if (targetProject && sourceProject && targetProject !== sourceProject && change?.includesBranding) {
    violations.push({ ruleId: "never_cross_brand", message: "Cross-project branding change blocked." });
  }
  if (change?.overwritesLockedUi && !change?.explicitApproval) {
    violations.push({ ruleId: "never_overwrite_locked_ui", message: "Locked UI overwrite requires approval." });
  }
  if (change?.removesLogo) {
    violations.push({ ruleId: "never_remove_real_logo", message: "Logo removal blocked." });
  }
  if (change?.duplicatesSection) {
    violations.push({ ruleId: "never_duplicate_sections", message: "Duplicate section blocked." });
  }
  if (change?.changesProtectedPricing && !change?.explicitApproval) {
    violations.push({ ruleId: "never_change_protected_pricing", message: "Protected pricing change blocked." });
  }
  if (change?.mockupOnly) {
    violations.push({ ruleId: "never_mockup_production", message: "Mockup-only production update blocked." });
  }
  if (change?.pushWithoutBuild) {
    violations.push({ ruleId: "never_push_without_build", message: "Push without build blocked." });
  }
  if (change?.deployWithoutVerify) {
    violations.push({ ruleId: "never_deploy_without_live_verify", message: "Deploy without live verify blocked." });
  }

  const blockRules = safety.filter((r) => (r.severity || r.severity) === "block");
  return {
    ok: violations.length === 0,
    violations,
    evaluatedRules: blockRules.length || safety.length,
  };
}

function runLocal(cmd, opts = {}) {
  return execSync(cmd, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: opts.silent ? "pipe" : "inherit",
    env: { ...process.env, ...opts.env },
  });
}

async function runShortcut(shortcutId, { projectKey = "resumora", writerAgent = "master_admin_shortcut", dryRun = false } = {}) {
  if (!canWrite(writerAgent) && shortcutId !== "load_locked_state" && shortcutId !== "scan_errors") {
    return { ok: false, error: "write_not_allowed", shortcutId };
  }

  const meta = SHORTCUTS.find((s) => s.id === shortcutId);
  if (!meta) return { ok: false, error: "unknown_shortcut", shortcutId };

  await hub.ensureBossmindHubMemoryInitialized();
  const run = dryRun
    ? null
    : await hub.startShortcutProcess({
        projectKey,
        processId: shortcutId,
        stepsTotal: meta.steps,
        payload: { writerAgent, dryRun },
      });

  const context = await loadProjectContext(projectKey, { writerAgent });
  const project = resolveProject(projectKey);
  const result = { shortcutId, label: meta.label, steps: [] };
  let ok = true;
  let errorMessage = null;

  try {
    switch (shortcutId) {
      case "load_locked_state": {
        result.steps.push({ step: "baseline", baselineHash: context.baselineHash });
        result.steps.push({ step: "design_snapshot", snapshot: context.designSnapshot?.snapshot_key || null });
        result.steps.push({ step: "checkpoint", present: Boolean(context.checkpoint) });
        break;
      }
      case "apply_safety_rules": {
        if (!dryRun) {
          const seeded = await seedRulesFromConfig({ writerAgent });
          result.steps.push({ step: "seed_safety", ...seeded });
        }
        result.steps.push({ step: "rules", count: context.safetyRules.length });
        break;
      }
      case "apply_marketing_rules": {
        if (!dryRun) {
          const seeded = await seedRulesFromConfig({ writerAgent });
          result.steps.push({ step: "seed_marketing", ...seeded });
        }
        result.steps.push({ step: "rules", count: context.marketingRules.length });
        break;
      }
      case "scan_errors": {
        result.steps.push({ step: "error_memory", count: context.errorMemory.length });
        break;
      }
      case "fix_from_error_memory": {
        result.steps.push({
          step: "suggest",
          note: "Run npm run bossmind:recovery:suggest locally; auto-fix requires approved patch.",
          patterns: context.errorMemory.slice(0, 5).map((e) => e.fix_pattern).filter(Boolean),
        });
        break;
      }
      case "verify_design_lock": {
        if (!dryRun) {
          const out = runLocal("npm run bossmind:locked-production:verify", { silent: true });
          result.steps.push({ step: "verify", excerpt: String(out).slice(0, 400) });
        }
        break;
      }
      case "run_preflight": {
        if (!dryRun) runLocal("npm run bossmind:enterprise:preflight", { silent: true });
        result.steps.push({ step: "preflight", ran: !dryRun });
        break;
      }
      case "build_safe": {
        if (!dryRun) runLocal("npm run build", { silent: true });
        result.steps.push({ step: "build", ran: !dryRun });
        break;
      }
      case "deploy_safe": {
        result.steps.push({
          step: "deploy",
          note: "Push to GitHub triggers Render/Railway; run git push from approved runner.",
          productionUrl: project.productionUrl,
        });
        break;
      }
      case "verify_live": {
        if (!dryRun && project.productionUrl) {
          const { runImmutableExecutionChain } = require("./bossmind-immutable-execution-chain");
          const chain = await runImmutableExecutionChain({
            cwd: process.cwd(),
            origin: project.productionUrl,
            screenshot: true,
          });
          result.steps.push({ step: "live", ok: chain.ok, screenshot: chain.screenshot?.path });
          if (chain.ok) {
            await hub.saveDeployVerification({
              projectKey,
              origin: project.productionUrl,
              routePath: "/pricing",
              ok: true,
              percent: chain.deploymentVerification?.percent ?? 100,
              payload: { pricingLive: chain.pricingLive },
              screenshotPath: chain.screenshot?.path || null,
              commitHash: chain.gitHead,
            });
          }
          ok = chain.ok;
        }
        break;
      }
      case "save_snapshot": {
        if (!dryRun) {
          runLocal("npm run bossmind:baseline:snapshot-sync", { silent: true });
          runLocal("npm run bossmind:baseline:seal", {
            silent: true,
            env: { BOSSMIND_BASELINE_OVERRIDE: "1" },
          });
          const baseline = loadJson("config/bossmind-immutable-production-baseline.json");
          await hub.saveDesignSnapshot({
            projectKey,
            snapshotKey: "locked_production",
            baselineHash: baseline?.lockedLuxuryInterfaceFingerprint,
            routePath: "/",
            payload: { sealedAt: new Date().toISOString() },
          });
          result.steps.push({ step: "sealed", hash: baseline?.lockedLuxuryInterfaceFingerprint });
        }
        break;
      }
      case "publish_organic_posts": {
        if (!dryRun) {
          runLocal("npm run bossmind:organic:growth", { silent: true });
        }
        result.steps.push({ step: "organic", ran: !dryRun });
        break;
      }
      case "run_autonomous_marketing": {
        if (!dryRun) {
          const { runAutonomousMarketingCycle } = require("./bossmind-autonomous-marketing-engine");
          const cycle = await runAutonomousMarketingCycle({
            projectKey,
            origin: project.productionUrl,
            writerAgent,
            persist: true,
          });
          result.steps.push({
            step: "marketing_cycle",
            ok: cycle.ok,
            score: cycle.marketingHealthScore,
            verify: cycle.phases?.verify?.ok,
          });
          ok = cycle.ok;
        }
        break;
      }
      case "run_runtime_authority": {
        if (!dryRun) {
          const { runRuntimeAuthorityCycle } = require("./bossmind-runtime-authority-engine");
          const cycle = await runRuntimeAuthorityCycle({
            projectKey,
            origin: project.productionUrl,
            writerAgent,
            captureScreenshot: true,
          });
          result.steps.push({
            step: "cycle",
            ok: cycle.ok,
            orchestrationPercent: cycle.orchestrationPercent,
            screenshot: cycle.visualValidation?.screenshotPath,
          });
          ok = cycle.ok;
        }
        break;
      }
      case "run_visual_verification": {
        if (!dryRun && project.productionUrl) {
          const { runVisualValidation } = require("./bossmind-visual-validation-engine");
          const visual = await runVisualValidation({
            projectKey,
            origin: project.productionUrl,
            captureScreenshot: true,
          });
          result.steps.push({ step: "visual", ok: visual.ok, path: visual.screenshotPath });
          ok = visual.ok;
        }
        break;
      }
      case "validate_production_truth": {
        const { resolveProductionState } = require("./bossmind-production-truth-validator");
        const truth = await resolveProductionState({
          projectKey,
          origin: project.productionUrl,
        });
        result.steps.push({ step: "truth", percent: truth.percent, ok: truth.ok });
        ok = truth.ok;
        break;
      }
      case "trigger_rollback": {
        const { verifyRollbackReadiness } = require("./bossmind-runtime-authority-engine");
        const rb = await verifyRollbackReadiness({ cwd: process.cwd(), projectKey });
        result.steps.push({ step: "rollback_ready", ...rb });
        if (!dryRun && rb.ok) {
          result.steps.push({
            step: "note",
            warning: "Execute npm run bossmind:baseline:restore only with explicit approval",
          });
        }
        break;
      }
      case "stripe_brand_sync": {
        const { applyStripeBrandSync } = require("../marketing/stripe-brand-sync");
        if (!dryRun) {
          const sync = await applyStripeBrandSync({ cwd: process.cwd(), dryRun: false });
          result.steps.push({
            step: "stripe_brand_sync",
            ok: sync.ok,
            applied: sync.applied?.length,
          });
          ok = sync.ok;
        }
        break;
      }
      case "stripe_dashboard_repair":
      case "stripe_session_repair": {
        const { runStripeSessionRecovery } = require("./bossmind-stripe-session-recovery");
        if (!dryRun) {
          const cycle = await runStripeSessionRecovery({
            cwd: process.cwd(),
            projectKey,
            apply: true,
            verify: true,
            persist: true,
            launchIsolated: true,
            writerAgent,
          });
          result.steps.push({
            step: "detect",
            primaryCause: cycle.detection?.primaryCause,
            signals: (cycle.detection?.signals || []).length,
          });
          result.steps.push({
            step: "repair",
            ok: cycle.repair?.ok,
            cookiesRemoved: cycle.repair?.report?.cookiesRemoved,
          });
          result.steps.push({
            step: "verify",
            ok: cycle.verification?.ok,
            loopHits: cycle.verification?.loopHits,
          });
          result.steps.push({ step: "persist", sharedMemory: cycle.sharedMemory });
          ok = cycle.ok;
        } else {
          const { detectStripeSessionIssue } = require("./bossmind-stripe-session-recovery");
          const d = await detectStripeSessionIssue({ cwd: process.cwd() });
          result.steps.push({ step: "detect_only", detection: d.detection });
        }
        break;
      }
      default:
        ok = false;
        errorMessage = "unhandled_shortcut";
    }

    if (!dryRun) {
      await hub.upsertBossmindMemory({
        projectKey,
        memoryKey: `shortcut:${shortcutId}:last`,
        memoryType: "shortcut_result",
        payload: { ok, result, at: new Date().toISOString() },
        writerAgent,
      });
    }
  } catch (e) {
    ok = false;
    errorMessage = e.message || String(e);
  }

  if (run?.id) {
    await hub.updateShortcutProcess({
      id: run.id,
      status: ok ? "completed" : "failed",
      stepIndex: meta.steps,
      result,
      errorMessage,
      finished: true,
    });
  }

  return { ok, shortcutId, dryRun, result, error: errorMessage };
}

async function getHubStatus() {
  await neon.ensureSharedMemoryInitialized();
  await hub.ensureBossmindHubMemoryInitialized();
  const presence = await hub.hubTablePresence();
  const strategy = loadJson("config/bossmind-shared-memory-strategy.json");
  const organic = loadOrganicGrowthRegistry(process.cwd());
  const projects = (strategy?.projects || []).map((p) => {
    const o = organic?.projects?.find((x) => x.id === p.id);
    return { ...p, organicRegistered: Boolean(o) };
  });
  return {
    ok: presence.enabled,
    neon: presence,
    projects,
    shortcuts: SHORTCUTS,
    accessPolicy: strategy?.accessPolicy || null,
    requiredTables: strategy?.requiredTables || [],
  };
}

module.exports = {
  SHORTCUTS,
  canWrite,
  seedRulesFromConfig,
  loadProjectContext,
  evaluateChangeAgainstRules,
  runShortcut,
  getHubStatus,
};
