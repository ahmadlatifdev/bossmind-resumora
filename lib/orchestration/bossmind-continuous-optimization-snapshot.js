/**
 * Evidence-only continuous optimization snapshot (no auto-edits, no protected UI mutation).
 * Consumed by `scripts/bossmind-continuous-optimization-cycle.mjs` and optional autonomous hook.
 */

const LIMITATIONS = [
  "Does not modify source files, dependencies, or protected UI baselines.",
  "Does not call Google/Meta/Stripe write APIs; use dashboards and approved scripts.",
  "SEO/marketing improvements are recommendations and existing draft pipelines only.",
];

function num(v, fallback = NaN) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function buildOptimizationSnapshot({
  projectKey = "resumora",
  cycle = 0,
  runtimeSync = null,
  reconciliation = null,
  predictiveRisk = null,
  hostingGate = null,
  envHints = {},
} = {}) {
  const ts = new Date().toISOString();
  const recommendations = [];
  const signals = {
    hasDrift: Boolean(runtimeSync?.hasDrift),
    compositeAutonomyScore: num(runtimeSync?.scores?.compositeAutonomyScore, NaN),
    reconciliationOk: reconciliation == null ? null : Boolean(reconciliation.ok),
    reconciliationScore: num(reconciliation?.score, NaN),
    predictiveRiskScore: num(predictiveRisk?.riskScore, NaN),
    hostingGuardRan: Boolean(hostingGate && hostingGate.skipped === false),
    hostingOk: hostingGate == null ? null : Boolean(hostingGate.ok),
    neonConfigured: Boolean(envHints.neonDatabaseUrl),
    stripePricesConfigured: Boolean(envHints.stripePricesConfigured),
    siteUrlConfigured: Boolean(envHints.siteUrlConfigured),
  };

  if (signals.hostingGuardRan && hostingGate && !hostingGate.ok) {
    recommendations.push({
      priority: 1,
      domain: "policy",
      action: "Fix hosting policy violations or set explicit BOSSMIND_ALLOW_VERCEL=1 after review.",
      command: "npm run validate:hosting",
    });
  }

  if (signals.hasDrift) {
    recommendations.push({
      priority: 1,
      domain: "runtime",
      action: "Runtime drift detected — run sync/heal path before deploy.",
      command: "npm run bossmind:runtime:sync:once",
    });
  }

  if (!Number.isNaN(signals.compositeAutonomyScore) && signals.compositeAutonomyScore < 70) {
    recommendations.push({
      priority: 2,
      domain: "runtime",
      action: "Composite autonomy below target — reconcile authority vs probe.",
      command: "npm run bossmind:reconcile",
    });
  }

  if (signals.reconciliationOk === false) {
    recommendations.push({
      priority: 1,
      domain: "deployment",
      action: "Reconciliation not aligned — inspect mismatches in .bossmind/reconciliation/status.json.",
      command: "npm run bossmind:reconcile",
    });
  }

  if (!Number.isNaN(signals.predictiveRiskScore) && signals.predictiveRiskScore >= 55) {
    recommendations.push({
      priority: 2,
      domain: "risk",
      action: `Predictive risk elevated (${signals.predictiveRiskScore}) — review factors before deploy.`,
      command: "npm run bossmind:enterprise:risk",
    });
  }

  if (!signals.neonConfigured) {
    recommendations.push({
      priority: 3,
      domain: "memory",
      action: "Neon not configured — shared-memory orchestration and persistence limited.",
      command: "Set NEON_DATABASE_URL on Railway worker",
    });
  }

  if (signals.siteUrlConfigured === false) {
    recommendations.push({
      priority: 3,
      domain: "marketing",
      action: "Set NEXT_PUBLIC_SITE_URL for canonical sitemap/robots and discovery APIs.",
      command: "docs/BOSSMIND_GLOBAL_TRAFFIC_DISCOVERY.md",
    });
  }

  if (signals.stripePricesConfigured === false) {
    recommendations.push({
      priority: 3,
      domain: "conversion",
      action: "Stripe public price IDs incomplete — conversion path may be degraded.",
      command: "npm run bossmind:stripe:production-report",
    });
  }

  recommendations.sort((a, b) => a.priority - b.priority);

  let readiness = 100;
  if (signals.hasDrift) readiness -= 28;
  if (signals.hostingGuardRan && signals.hostingOk === false) readiness -= 35;
  if (signals.reconciliationOk === false) readiness -= 18;
  if (!Number.isNaN(signals.compositeAutonomyScore) && signals.compositeAutonomyScore < 70) {
    readiness -= Math.min(22, Math.round(70 - signals.compositeAutonomyScore));
  }
  if (!Number.isNaN(signals.predictiveRiskScore)) {
    readiness -= Math.min(25, Math.round(signals.predictiveRiskScore * 0.22));
  }
  if (!signals.neonConfigured) readiness -= 6;
  readiness = Math.max(0, Math.min(100, Math.round(readiness)));

  return {
    kind: "bossmind.continuous_optimization.v1",
    ts,
    projectKey,
    cycle,
    optimizationReadinessScore: readiness,
    predictiveRiskSnapshot: predictiveRisk || null,
    recommendations,
    signals,
    limitations: LIMITATIONS,
  };
}

async function persistOptimizationSnapshot(neonApi, snap) {
  if (!neonApi || typeof neonApi.saveEvent !== "function") return { persisted: false, reason: "no_neon" };
  try {
    await neonApi.saveEvent({
      projectKey: snap.projectKey,
      eventType: "bossmind.optimization_cycle",
      severity: snap.optimizationReadinessScore < 50 ? "warning" : "info",
      source: "bossmind-continuous-optimization",
      eventKey: `opt_${snap.ts}`,
      payload: {
        readiness: snap.optimizationReadinessScore,
        recommendationCount: snap.recommendations.length,
        topRecommendations: snap.recommendations.slice(0, 8),
        predictiveRiskScore: snap.predictiveRiskSnapshot?.riskScore ?? null,
      },
    });
    await neonApi.upsertTaskState({
      projectKey: snap.projectKey,
      taskKey: "bossmind_continuous_optimization",
      status: "completed",
      assignedAgent: "continuous-optimization-engine",
      payload: snap,
    });
    return { persisted: true };
  } catch (e) {
    return { persisted: false, reason: e.message || String(e) };
  }
}

module.exports = {
  buildOptimizationSnapshot,
  persistOptimizationSnapshot,
};
