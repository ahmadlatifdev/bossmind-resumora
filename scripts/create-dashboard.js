#!/usr/bin/env node
/**
 * Create BossMind-Observability-Dashboard in CloudWatch.
 *
 * Usage:
 *   node scripts/create-dashboard.js [--region=us-east-1] [--dry-run]
 *
 * Env:
 *   AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_SESSION_TOKEN (or shared credentials / SSO)
 *   AWS_REGION — defaults to us-east-1
 *
 * Also writes scripts/bossmind-observability-dashboard.json (source of truth for dashboard body).
 */

const fs = require("fs");
const path = require("path");

const DASHBOARD_NAME = "BossMind-Observability-Dashboard";
const DEFAULT_REGION = "us-east-1";
const DASHBOARD_JSON = path.join(__dirname, "bossmind-observability-dashboard.json");

function parseArgs() {
  let region = process.env.AWS_REGION || DEFAULT_REGION;
  let dryRun = false;
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith("--region=")) region = arg.split("=")[1];
    if (arg === "--dry-run") dryRun = true;
  }
  return { region, dryRun };
}

function loadDashboardBody() {
  if (!fs.existsSync(DASHBOARD_JSON)) {
    throw new Error(`Dashboard body not found: ${DASHBOARD_JSON}`);
  }
  const raw = fs.readFileSync(DASHBOARD_JSON, "utf8");
  JSON.parse(raw);
  return raw;
}

async function verifyCredentials(region) {
  let stsSdk;
  try {
    stsSdk = require("@aws-sdk/client-sts");
  } catch {
    console.error(
      "[BossMind] WARNING: @aws-sdk/client-sts not installed. Run: npm install @aws-sdk/client-cloudwatch @aws-sdk/client-sts"
    );
    return false;
  }

  const sts = new stsSdk.STSClient({ region });
  try {
    const identity = await sts.send(new stsSdk.GetCallerIdentityCommand({}));
    console.log(`[BossMind] AWS credentials verified (account ${identity.Account}).`);
    return true;
  } catch (err) {
    console.error(
      `[BossMind] WARNING: AWS credentials missing or invalid. Configure credentials before creating dashboard.\n` +
        `  Detail: ${err.message || err}`
    );
    return false;
  }
}

async function putDashboard(region, dashboardBody, dryRun) {
  if (dryRun) {
    console.log(`[BossMind] Dry run — would create dashboard "${DASHBOARD_NAME}" in ${region}.`);
    return { dryRun: true, dashboardName: DASHBOARD_NAME, region };
  }

  let CloudWatchClient, PutDashboardCommand;
  try {
    ({ CloudWatchClient, PutDashboardCommand } = require("@aws-sdk/client-cloudwatch"));
  } catch {
    console.error(
      "[BossMind] WARNING: @aws-sdk/client-cloudwatch not installed. Run: npm install @aws-sdk/client-cloudwatch"
    );
    process.exitCode = 1;
    return null;
  }

  const client = new CloudWatchClient({ region });
  try {
    await client.send(
      new PutDashboardCommand({
        DashboardName: DASHBOARD_NAME,
        DashboardBody: dashboardBody,
      })
    );
    console.log(`[BossMind] Dashboard "${DASHBOARD_NAME}" created/updated in ${region}.`);
    return { dashboardName: DASHBOARD_NAME, region, status: "ok" };
  } catch (err) {
    console.error(`[BossMind] WARNING: Failed to create dashboard: ${err.message || err}`);
    process.exitCode = 1;
    return null;
  }
}

async function main() {
  const { region, dryRun } = parseArgs();
  const dashboardBody = loadDashboardBody();

  console.log(`[BossMind] Dashboard body: ${DASHBOARD_JSON}`);
  console.log(`[BossMind] Region: ${region}`);

  const ok = await verifyCredentials(region);
  if (!ok) {
    console.error("[BossMind] Skipping PutDashboard — fix credentials and retry.");
    process.exitCode = 1;
    return;
  }

  const result = await putDashboard(region, dashboardBody, dryRun);
  if (result) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }
}

main().catch((err) => {
  console.error(`[BossMind] WARNING: ${err.message || err}`);
  process.exitCode = 1;
});
