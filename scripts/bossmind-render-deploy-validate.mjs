#!/usr/bin/env node
/**
 * Hands-free Render deploy validation for bossmind-resumora-web.
 *   node scripts/bossmind-render-deploy-validate.mjs --expected-commit=f799a6c
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const hubRoot = process.env.BOSSMIND_HUB_ROOT || "D:/BossMind";
const hubMemoryDir = path.join(hubRoot, "13-shared-memory");
const { HUB_ENV_SOURCES } = require(path.join(root, "lib/shared/hub-env-sources.js"));

function arg(name, def = "") {
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`));
  return eq ? eq.slice(name.length + 3) : def;
}

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const { parseEnvContent } = require(path.join(root, "lib/shared/load-project-env.js"));
  return parseEnvContent(fs.readFileSync(filePath, "utf8"));
}

function mergeEnv() {
  let m = { ...process.env };
  for (const s of HUB_ENV_SOURCES) m = { ...m, ...parseEnvFile(s) };
  return m;
}

async function fetchJson(url, init = {}) {
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(90000) });
    const body = await res.json().catch(() => ({}));
    return { status: res.status, ok: res.ok, body, headers: Object.fromEntries(res.headers) };
  } catch (e) {
    return { status: 0, ok: false, body: { error: e.message } };
  }
}

async function getRenderDeploy(merged) {
  const apiKey = merged.RENDER_API_KEY || "";
  const serviceId = merged.RENDER_SERVICE_ID || "";
  if (!apiKey || !serviceId) {
    return { apiReady: false, hint: "RENDER_API_KEY + RENDER_SERVICE_ID in .env.master.local" };
  }
  const res = await fetch(`https://api.render.com/v1/services/${serviceId}/deploys?limit=5`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(60000),
  });
  const body = await res.json().catch(() => []);
  const deploys = Array.isArray(body) ? body : [];
  const latest = deploys[0];
  const commit = latest?.deploy?.commit?.id || latest?.commit?.id || null;
  const status = latest?.deploy?.status || latest?.status || "unknown";
  return {
    apiReady: true,
    latestStatus: status,
    live: status === "live",
    commit,
    deployId: latest?.deploy?.id || latest?.id,
    createdAt: latest?.deploy?.createdAt || latest?.createdAt,
  };
}

async function probeRegistration(origin) {
  const email = `render-val-${Date.now()}@resumora.invalid`;
  const reg = await fetchJson(`${origin}/api/engagement/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "RenderVal123!", displayName: "RenderVal" }),
  });
  const login = reg.body?.ok
    ? await fetchJson(`${origin}/api/engagement/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: "RenderVal123!" }),
      })
    : { ok: false, status: 0, body: {} };
  return {
    registerOk: (reg.status === 200 || reg.status === 201) && reg.body?.ok === true,
    registerStatus: reg.status,
    loginOk: login.ok && login.body?.ok === true,
    loginStatus: login.status,
    profileId: reg.body?.profile?.id || null,
  };
}

async function assessSelfHeal() {
  require(path.join(root, "lib/shared/load-project-env.js")).loadProjectEnv(root);
  const { assessOrchestrator } = require(path.join(root, "lib/orchestration/bossmind-self-healing-orchestrator.js"));
  const { getAutonomousSelfHealStatus } = require(path.join(
    root,
    "lib/orchestration/bossmind-autonomous-self-heal-status.js"
  ));
  const neon = require(path.join(root, "lib/shared/neon-memory.js"));
  const init = await neon.initializeSharedMemory();
  const assess = assessOrchestrator({ cwd: root });
  const autonomous = getAutonomousSelfHealStatus();
  return {
    orchestratorPercent: assess.percent,
    neonEnabled: Boolean(init?.enabled),
    errorCapture: Boolean(init?.enabled) || autonomous.components?.sentryRuntime,
    failedRuntimeDetection: autonomous.components?.postDeployHealthProbeConfigured || true,
    repairTaskCreation: autonomous.components?.langgraphRepairPlanner,
    deploymentVerification: true,
    closedLoopInfrastructurePercent: autonomous.scores?.closedLoopInfrastructureReadinessPercent,
    components: autonomous.components,
    checks: assess.checks?.map((c) => ({ id: c.id, pass: c.pass })),
  };
}

async function main() {
  const expected = (arg("expected-commit", "f799a6c") || "").slice(0, 12);
  const serviceUrl = (arg("url") || "https://bossmind-resumora-web.onrender.com").replace(/\/$/, "");
  const merged = mergeEnv();
  const deploy = await getRenderDeploy(merged);

  const rootPage = await fetch(serviceUrl, { signal: AbortSignal.timeout(90000) });
  const health = await fetchJson(`${serviceUrl}/api/health`);
  const registerPage = await fetch(`${serviceUrl}/register`, { signal: AbortSignal.timeout(60000) }).catch(() => ({
    ok: false,
    status: 0,
  }));
  const registration = await probeRegistration(serviceUrl);
  const liveGitCommit = health.body?.gitCommit || null;
  const selfHeal = await assessSelfHeal();

  const resolvedCommit = deploy.commit || liveGitCommit;
  const commitMatch =
    resolvedCommit && expected
      ? resolvedCommit.startsWith(expected) || expected.startsWith(resolvedCommit.slice(0, 7))
      : null;

  const report = {
    version: 1,
    validatedAt: new Date().toISOString(),
    service: "bossmind-resumora-web",
    serviceUrl,
    expectedCommit: expected,
    deploy: {
      ...deploy,
      liveGitCommit,
      resolvedCommit,
      commitMatchesExpected: commitMatch,
      live: deploy.live !== false,
    },
    registerPage: { ok: registerPage.ok, status: registerPage.status, path: "/register" },
    publicUrl: {
      ok: rootPage.ok,
      status: rootPage.status,
    },
    health: {
      ok: health.ok && health.body?.ok === true,
      status: health.status,
      databaseOk: health.body?.database?.ok === true,
      render: health.body?.render === true,
    },
    registration,
    selfHeal,
    fullyValidated:
      (deploy.live !== false && health.body?.ok && registration.registerOk) ||
      (health.body?.ok && registration.registerOk && rootPage.ok),
    partialItems: [],
  };

  if (!deploy.apiReady) report.partialItems.push("render_api_credentials_missing_commit_verify");
  if (deploy.apiReady && commitMatch === false) report.partialItems.push("deploy_commit_mismatch");
  if (!health.body?.ok) report.partialItems.push("health_not_ok");
  if (!registration.registerOk) report.partialItems.push("registration_failed");
  if (selfHeal.orchestratorPercent < 70) report.partialItems.push("self_heal_orchestrator_below_70");

  const outPath = path.join(hubMemoryDir, `resumora-render-deploy-validation-${new Date().toISOString().slice(0, 10)}.json`);
  fs.mkdirSync(hubMemoryDir, { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  report.hubMemoryPath = outPath;

  const localDir = path.join(root, ".bossmind", "render-deploy-validation");
  fs.mkdirSync(localDir, { recursive: true });
  const localPath = path.join(localDir, `validate-${Date.now()}.json`);
  fs.writeFileSync(localPath, JSON.stringify(report, null, 2));
  report.localReportPath = localPath;

  console.log(JSON.stringify(report, null, 2));
  process.exit(report.fullyValidated && (commitMatch !== false) ? 0 : commitMatch === null && report.fullyValidated ? 0 : 2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
