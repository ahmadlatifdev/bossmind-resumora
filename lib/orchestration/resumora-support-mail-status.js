/**
 * Sync summary for BossMind health + production reports (no live DNS unless caller awaits verify).
 */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

function sha256Hex(s) {
  return crypto.createHash("sha256").update(String(s), "utf8").digest("hex");
}

function readLatestVerificationReport(repoRoot) {
  const dir = path.join(repoRoot, "windows-heal", "reports");
  if (!fs.existsSync(dir)) return null;
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith("resumora-support-mail-verification-") && f.endsWith(".json"));
  if (!files.length) return null;
  files.sort();
  const last = files[files.length - 1];
  const full = path.join(dir, last);
  try {
    const j = JSON.parse(fs.readFileSync(full, "utf8"));
    return {
      file: full.replace(/\\/g, "/"),
      checkedAt: j.checkedAt || null,
      spamHeuristic: j.spamHeuristic || null,
      authenticationSummary: j.authenticationSummary || null,
    };
  } catch {
    return { file: full.replace(/\\/g, "/"), parseError: true };
  }
}

function getSupportMailBossMindSummary(repoRoot = process.cwd()) {
  const archPath = path.join(repoRoot, "config", "resumora-ai-support-mail-architecture.json");
  const dnsAuthPath = path.join(repoRoot, "config", "resumora-support-mail-dns-authority.json");
  const templatesPath = path.join(repoRoot, "config", "resumora-support-branded-reply-templates.json");

  let arch = null;
  let archSha = null;
  try {
    const raw = fs.readFileSync(archPath, "utf8");
    arch = JSON.parse(raw);
    archSha = sha256Hex(raw);
  } catch {
    arch = null;
  }

  const webhook =
    Boolean(process.env.BOSSMIND_SUPPORT_WEBHOOK_SECRET) ||
    Boolean(process.env.BOSSMIND_ORCHESTRATION_SECRET);
  const neon = Boolean(process.env.NEON_DATABASE_URL);
  const lastReport = readLatestVerificationReport(repoRoot);

  return {
    generatedAt: new Date().toISOString(),
    supportMailbox: arch?.supportMailbox || "support@resumora.net",
    architecture: {
      present: Boolean(arch),
      version: arch?.version ?? null,
      sha256: archSha,
      routingRulesCount: Array.isArray(arch?.routing) ? arch.routing.length : 0,
      classifyApiPath: "/api/orchestration/support-mail-classify",
      dedupeApiPath: arch?.runtimeApi?.supportMailDedupePost || "/api/orchestration/support-mail-dedupe",
    },
    dnsAuthorityTemplate: {
      present: fs.existsSync(dnsAuthPath),
      path: "config/resumora-support-mail-dns-authority.json",
    },
    brandedTemplates: {
      present: fs.existsSync(templatesPath),
      path: "config/resumora-support-branded-reply-templates.json",
    },
    integration: {
      webhookBearerConfigured: webhook,
      neonSharedMemoryConfigured: neon,
    },
    lastDnsVerificationReport: lastReport,
    recovery: {
      killSwitches: ["BOSSMIND_SUPPORT_AI_EMERGENCY_STOP=1", "BOSSMIND_SUPPORT_AI_AUTO_SEND=0"],
      notes: "Gmail session reconnect is Google client / OAuth refresh — not controlled in this repo.",
    },
  };
}

function computeSupportMailReadinessPercent(summary, liveDns) {
  let earned = 0;
  let max = 0;
  const add = (w, ok) => {
    max += w;
    if (ok) earned += w;
  };
  add(20, summary.architecture?.present);
  add(10, summary.dnsAuthorityTemplate?.present);
  add(15, summary.integration.webhookBearerConfigured);
  add(15, summary.integration.neonSharedMemoryConfigured);
  add(10, Boolean(summary.brandedTemplates?.present));
  add(10, Boolean(summary.lastDnsVerificationReport?.spamHeuristic));
  if (liveDns?.spamHeuristic) {
    add(20, liveDns.spamHeuristic.band === "pass");
  } else if (summary.lastDnsVerificationReport?.spamHeuristic) {
    add(20, summary.lastDnsVerificationReport.spamHeuristic.band === "pass");
  } else {
    max += 20;
  }
  return max > 0 ? Math.round((earned / max) * 1000) / 10 : 0;
}

module.exports = {
  getSupportMailBossMindSummary,
  computeSupportMailReadinessPercent,
  readLatestVerificationReport,
};
