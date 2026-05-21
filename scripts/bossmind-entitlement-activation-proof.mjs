#!/usr/bin/env node
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
require(path.join(root, "lib/shared/load-project-env.js")).loadProjectEnv(root);

const BASE = process.env.BOSSMIND_VALIDATION_BASE || "https://bossmind-resumora-web.onrender.com";

async function get(path) {
  const url = `${BASE.replace(/\/$/, "")}${path}`;
  const res = await fetch(url, { redirect: "follow" });
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { url, status: res.status, json };
}

const health = await get("/api/health");
const workspace = await get("/api/client/workspace?lang=en");
const activate = await get("/api/client/activate-plan?lang=en");
const onboarding = await get("/api/client/onboarding?lang=en");

const report = {
  generatedAt: new Date().toISOString(),
  base: BASE,
  gitCommit: health.json?.gitCommit,
  proofs: {
    health: health.status === 200,
    workspaceApi: workspace.status === 200,
    activatePlanApi: activate.status === 200,
    onboardingApi: onboarding.status === 200,
    activationPipelineDeployed: Boolean(activate.json?.activation),
  },
  aggregateReadinessPercent: 0,
  weakPoints: [],
};

let score = 0;
if (report.proofs.health) score += 25;
if (report.proofs.workspaceApi) score += 25;
if (report.proofs.activatePlanApi) score += 30;
if (report.proofs.onboardingApi) score += 10;
if (report.proofs.activationPipelineDeployed) score += 10;
report.aggregateReadinessPercent = score;
if (!report.proofs.activatePlanApi) {
  report.weakPoints.push("Deploy latest commit with /api/client/activate-plan");
}
report.weakPoints.push("Full paid-session E2E requires sandbox checkout with logged-in user");

console.log(JSON.stringify(report, null, 2));
process.exit(score >= 85 ? 0 : 1);
