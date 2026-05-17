#!/usr/bin/env node
/**
 * Proof-oriented Resumora support-mail production report (DNS live + integration signals).
 *
 *   npm run resumora:support:production-report
 *
 * Env: RESUMORA_MAIL_DOMAIN (default resumora.net), NEON_DATABASE_URL optional
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function argVal(name, def) {
  const prefix = `--${name}=`;
  const p = process.argv.find((a) => a.startsWith(prefix));
  if (p) return p.slice(prefix.length).trim();
  return def;
}

async function main() {
  try {
    require(path.join(root, "lib/shared/load-project-env.js")).loadProjectEnv(root);
  } catch {
    /* optional */
  }

  const { verifySupportMailDns, loadDnsAuthorityRecommendations } = require(path.join(
    root,
    "lib/orchestration/resumora-support-mail-dns.js"
  ));
  const {
    getSupportMailBossMindSummary,
    computeSupportMailReadinessPercent,
  } = require(path.join(root, "lib/orchestration/resumora-support-mail-status.js"));
  const { classifySupportIntake } = require(path.join(root, "lib/orchestration/resumora-support-mail-classify.js"));

  const domain = argVal("domain", process.env.RESUMORA_MAIL_DOMAIN || "resumora.net");
  const dns = await verifySupportMailDns(domain);
  const dnsAuth = loadDnsAuthorityRecommendations(root);
  const bossmind = getSupportMailBossMindSummary(root);
  const sampleClassify = classifySupportIntake(root, {
    subject: "Question about pricing for Resumora executive career package",
    body: "Hello, what is the cost?",
    hasAttachment: false,
  });
  const readinessPercent = computeSupportMailReadinessPercent(bossmind, dns);

  const report = {
    generatedAt: new Date().toISOString(),
    domain,
    spf: dns.spf,
    dmarc: dns.dmarc,
    dkimSelectors: dns.dkim,
    authenticationSummary: dns.authenticationSummary,
    spamHeuristic: dns.spamHeuristic,
    dnsAuthorityTemplate: dnsAuth,
    bossmindIntegration: bossmind,
    aiRouting: {
      engine: "heuristic_v1_in_repo",
      classifyApiPath: "/api/orchestration/support-mail-classify",
      sampleClassification: sampleClassify,
      notes: [
        "LLM-based routing stays in n8n (DeepSeek/OpenAI) per config/resumora-ai-support-mail-architecture.json.",
        "This report's sample is deterministic only.",
      ],
    },
    deliveryAndInbox: {
      status: "not_probed_from_repo",
      notes: bossmind.lastDnsVerificationReport?.spamHeuristic
        ? "Use lastDnsVerificationReport + Google Postmaster for reputation."
        : "Run npm run resumora:support:mail:verify to capture DNS snapshot on disk + Neon.",
    },
    recoveryReadiness: bossmind.recovery,
    proofBasedProductionReadinessPercent: readinessPercent,
    memoryLockCommands: {
      architecture: 'npm run resumora:support:ai:arch-lock -- --i-understand-external-ops-manual --notes="..."',
      dnsVerification: "npm run resumora:support:mail:verify",
    },
  };

  const outDir = path.join(root, "windows-heal", "reports");
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outFile = path.join(outDir, `resumora-support-mail-production-report-${stamp}.json`);
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2), "utf8");
  report.reportFile = outFile.replace(/\\/g, "/");

  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
