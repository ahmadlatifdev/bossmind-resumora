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
import dns from "node:dns/promises";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function hasFlag(name) {
  return process.argv.some((a) => a === `--${name}` || a.startsWith(`--${name}=`));
}

function argVal(name, def) {
  const p = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (p) return p.slice(`--${name}=`.length).trim();
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

function scoreDns({ mx, spf, dmarc, dkim }) {
  const issues = [];
  let score = 100;
  if (!mx.length) {
    issues.push("no_mx");
    score -= 40;
  } else {
    const hosts = mx.map((m) => m.exchange.toLowerCase());
    const googleMx = hosts.some((h) => h.includes("google") || h.includes("googlemail"));
    if (!googleMx) {
      issues.push("mx_not_google_workspace_pattern");
      score -= 15;
    }
  }
  if (!spf.found) {
    issues.push("no_spf_txt");
    score -= 25;
  } else if (!spf.includesGoogle && !spf.includesSendgrid && !spf.includesMicrosoft) {
    issues.push("spf_no_known_provider_include");
    score -= 10;
  }
  if (!dmarc.found) {
    issues.push("no_dmarc");
    score -= 15;
  } else if (dmarc.policy === "none") {
    issues.push("dmarc_monitoring_only");
    score -= 5;
  }
  const dkimOk = Object.values(dkim).some((x) => x.found);
  if (!dkimOk) {
    issues.push("no_dkim_selector_matched");
    score -= 20;
  }
  score = Math.max(0, Math.min(100, score));
  const band = score >= 85 ? "pass" : score >= 65 ? "warn" : "fail";
  return { score, band, issues };
}

async function verifyDomain(domain) {
  const mx = await dns.resolveMx(domain).catch(() => []);
  const rootTxt = await dns.resolveTxt(domain).catch(() => []);
  const flatTxt = rootTxt.flat().map((s) => String(s).trim());
  const spfRecord = flatTxt.find((t) => t.toLowerCase().startsWith("v=spf1"));
  const spf = {
    found: Boolean(spfRecord),
    raw: spfRecord || "",
    includesGoogle: /include:_spf\.google\.com|include:spf\.google\.com/i.test(spfRecord || ""),
    includesSendgrid: /sendgrid/i.test(spfRecord || ""),
    includesMicrosoft: /include:spf\.protection\.outlook\.com/i.test(spfRecord || ""),
  };

  const dmarcName = `_dmarc.${domain}`;
  let dmarcTxt = [];
  try {
    dmarcTxt = (await dns.resolveTxt(dmarcName)).flat().map((s) => String(s).trim());
  } catch {
    dmarcTxt = [];
  }
  const dmarcRecord = dmarcTxt.find((t) => t.toLowerCase().startsWith("v=dmarc1"));
  let policy = "";
  if (dmarcRecord) {
    const m = dmarcRecord.match(/;\s*p=([^;]+)/i);
    policy = m ? m[1].trim().toLowerCase() : "";
  }
  const dmarc = {
    host: dmarcName,
    found: Boolean(dmarcRecord),
    raw: dmarcRecord || "",
    policy: policy || "unknown",
  };

  const selectors = ["google", "selector1", "selector2", "k1", "default", "s1", "smtp"];
  const dkim = {};
  for (const sel of selectors) {
    const host = `${sel}._domainkey.${domain}`;
    let rows = [];
    try {
      rows = (await dns.resolveTxt(host)).flat().map((s) => String(s).replace(/\s+/g, ""));
    } catch {
      rows = [];
    }
    const joined = rows.join("");
    const found = joined.toLowerCase().includes("v=dkim1") || joined.toLowerCase().includes("k=rsa");
    dkim[sel] = { host, found, recordChars: joined.length };
  }

  const spamHeuristic = scoreDns({ mx, spf, dmarc, dkim });
  return {
    domain,
    checkedAt: new Date().toISOString(),
    mx: mx.sort((a, b) => a.priority - b.priority),
    spf,
    dmarc,
    dkim,
    spamHeuristic,
    autoResponse: {
      note: "Gmail / Workspace auto-reply and n8n flows are configured in Google Admin and n8n, not in this repository.",
      dedupeApiPath: "/api/orchestration/support-mail-dedupe",
      killSwitches: ["BOSSMIND_SUPPORT_AI_EMERGENCY_STOP=1", "BOSSMIND_SUPPORT_AI_AUTO_SEND=0"],
    },
    synchronization: {
      note: "Gmail mobile/desktop sync is a Google client feature; no Resumora server toggle.",
    },
    delivery: {
      note: "Inbox vs spam depends on sender reputation, content, and recipient filters — DNS hygiene below reduces technical rejects only.",
    },
  };
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
    commitHash: process.env.GITHUB_SHA || "",
    baselineHash: reportHash,
    payload: {
      dnsOk: report.spamHeuristic?.band !== "fail",
      issues: report.spamHeuristic?.issues || [],
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
  const report = await verifyDomain(domain);

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

  const outDir = join(root, "windows-heal", "reports");
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outFile = join(outDir, `resumora-support-mail-verification-${stamp}.json`);
  report.neonLock = await neonLock(report);
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2), "utf8");

  console.log(JSON.stringify({ outFile: outFile.replace(/\\/g, "/"), spamHeuristic: report.spamHeuristic, neonLock: report.neonLock }, null, 2));
  if (report.spamHeuristic.band === "fail" && hasFlag("fail-on-bad-dns")) process.exit(2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
