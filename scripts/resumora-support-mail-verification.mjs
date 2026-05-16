#!/usr/bin/env node
/**
 * Resumora support mail — DNS / MX health + Neon verification lock (no Gmail API).
 * Does NOT send email, enable Workspace auto-reply, or change spam placement.
 *
 *   node scripts/resumora-support-mail-verification.mjs
 *   node scripts/resumora-support-mail-verification.mjs --no-neon
 *   node scripts/resumora-support-mail-verification.mjs --fail-on-bad-dns
 *
 * Env:
 *   RESUMORA_MAIL_DOMAIN — default resumora.net
 *   NEON_DATABASE_URL — writes support_mail.verification_report + checkpoint resumora_support_mail_verification
 *   BOSSMIND_PROJECT_KEY — default resumora
 */
import fs from "node:fs";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const {
  verifySupportMailDns,
  loadDnsAuthorityRecommendations,
} = require(join(root, "lib/orchestration/resumora-support-mail-dns.js"));

function hasFlag(name) {
  return process.argv.some((a) => a === `--${name}` || a.startsWith(`--${name}=`));
}

function argVal(name, def) {
  const prefix = `--${name}=`;
  const p = process.argv.find((a) => a.startsWith(prefix));
  if (p) return p.slice(prefix.length).trim();
  return def;
}

function sha256Hex(s) {
  return crypto.createHash("sha256").update(String(s), "utf8").digest("hex");
}

async function loadEnv() {
  try {
    require(join(root, "lib/shared/load-project-env.js")).loadProjectEnv(root);
  } catch {
    /* optional */
  }
}

async function neonLock(report) {
  if (hasFlag("no-neon")) return { skipped: true };
  const neon = require(join(root, "lib/shared/neon-memory.js"));
  await neon.ensureSharedMemoryInitialized().catch(() => {});
  if (!neon.getSqlClient()) {
    return { skipped: true, reason: "NEON_DATABASE_URL unset" };
  }
  const projectKey = process.env.BOSSMIND_PROJECT_KEY || "resumora";
  const reportHash = sha256Hex(JSON.stringify(report));
  const payload = {
    reportHash,
    domain: report.domain,
    spamBand: report.spamHeuristic?.band,
    spamScore: report.spamHeuristic?.score,
    checkedAt: report.checkedAt,
    authenticationAggregate: report.authenticationSummary?.aggregate,
  };

  await neon.saveEvent({
    projectKey,
    eventType: "support_mail.verification_report",
    severity: "info",
    source: "resumora-support-mail-verification",
    eventKey: `support_verify:${report.checkedAt}`,
    payload,
  });

  await neon.upsertLastConfirmedCheckpoint({
    projectKey,
    checkpointKey: "resumora_support_mail_verification",
    commitHash:
      process.env.GITHUB_SHA ||
      process.env.RAILWAY_GIT_COMMIT_SHA ||
      process.env.RENDER_GIT_COMMIT ||
      "",
    baselineHash: reportHash,
    payload: {
      dnsOk: report.spamHeuristic?.band !== "fail",
      issues: report.spamHeuristic?.issues || [],
      authenticationAggregate: report.authenticationSummary?.aggregate,
    },
    source: "resumora-support-mail-verification",
    locked: true,
  });

  await neon.upsertTaskState({
    projectKey,
    taskKey: "support_mail:verification_latest",
    status: "verified",
    assignedAgent: "resumora-support-mail-verification",
    payload: { reportHash, ...payload },
  });

  return { ok: true, reportHash, checkpointKey: "resumora_support_mail_verification" };
}

async function main() {
  await loadEnv();
  const domain = argVal("domain", process.env.RESUMORA_MAIL_DOMAIN || "resumora.net");
  const report = await verifySupportMailDns(domain);

  const dnsAuth = loadDnsAuthorityRecommendations(root);
  report.dnsAuthorityRecommendations = dnsAuth.recommendations;
  report.dnsAuthorityPath = dnsAuth.path;

  const templatesPath = join(root, "config", "resumora-support-branded-reply-templates.json");
  if (fs.existsSync(templatesPath)) {
    report.brandedTemplates = {
      path: "config/resumora-support-branded-reply-templates.json",
      sha256: sha256Hex(fs.readFileSync(templatesPath, "utf8")),
    };
  }

  const archPath = join(root, "config", "resumora-ai-support-mail-architecture.json");
  if (fs.existsSync(archPath)) {
    report.architecture = {
      path: "config/resumora-ai-support-mail-architecture.json",
      sha256: sha256Hex(fs.readFileSync(archPath, "utf8")),
    };
  }

  report.autoResponse = {
    note: "Gmail / Workspace auto-reply and n8n flows are configured in Google Admin and n8n, not in this repository.",
    dedupeApiPath: "/api/orchestration/support-mail-dedupe",
    classifyApiPath: "/api/orchestration/support-mail-classify",
    killSwitches: ["BOSSMIND_SUPPORT_AI_EMERGENCY_STOP=1", "BOSSMIND_SUPPORT_AI_AUTO_SEND=0"],
  };
  report.synchronization = {
    note: "Gmail mobile/desktop sync is a Google client feature; no Resumora server toggle.",
  };
  report.delivery = {
    note: "Inbox vs spam depends on sender reputation, content, and recipient filters — DNS hygiene below reduces technical rejects only.",
  };

  const outDir = join(root, "windows-heal", "reports");
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outFile = join(outDir, `resumora-support-mail-verification-${stamp}.json`);
  report.neonLock = await neonLock(report);
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2), "utf8");

  console.log(
    JSON.stringify(
      {
        outFile: outFile.replace(/\\/g, "/"),
        spamHeuristic: report.spamHeuristic,
        authenticationSummary: report.authenticationSummary,
        neonLock: report.neonLock,
      },
      null,
      2
    )
  );
  if (report.spamHeuristic.band === "fail" && hasFlag("fail-on-bad-dns")) process.exit(2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
