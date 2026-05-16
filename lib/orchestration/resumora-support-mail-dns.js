/**
 * Resumora support mail — DNS verification (MX / SPF / DMARC / DKIM selectors).
 * Used by scripts and optional BossMind health summaries.
 */
const dns = require("node:dns/promises");
const fs = require("node:fs");
const path = require("node:path");

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

function authenticationPass({ spf, dmarc, dkim }) {
  const dkimOk = Object.values(dkim).some((x) => x.found);
  return {
    spfPass: Boolean(spf.found && spf.includesGoogle),
    dmarcPass: Boolean(dmarc.found && dmarc.policy && dmarc.policy !== "unknown"),
    dmarcStrict: Boolean(dmarc.policy === "quarantine" || dmarc.policy === "reject"),
    dkimPass: dkimOk,
    allTechnicalPass: Boolean(
      spf.found && spf.includesGoogle && dmarc.found && dkimOk && dmarc.policy !== "none"
    ),
  };
}

async function verifySupportMailDns(domain) {
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
  const auth = authenticationPass({ spf, dmarc, dkim });

  return {
    domain,
    checkedAt: new Date().toISOString(),
    mx: mx.sort((a, b) => a.priority - b.priority),
    spf,
    dmarc,
    dkim,
    spamHeuristic,
    authenticationSummary: {
      ...auth,
      aggregate: auth.allTechnicalPass ? "pass" : auth.spfPass && auth.dmarcPass && auth.dkimPass ? "warn" : "fail",
      notes: [
        "SPF/DKIM/DMARC must be set at your DNS host (not in this repo). DKIM public key is generated in Google Admin > Apps > Google Workspace > Gmail > Authenticate email.",
        "DMARC p=none is monitoring-only; move to quarantine/reject after monitoring.",
      ],
    },
  };
}

function loadDnsAuthorityRecommendations(repoRoot) {
  const p = path.join(repoRoot, "config", "resumora-support-mail-dns-authority.json");
  if (!fs.existsSync(p)) return { path: null, recommendations: null };
  try {
    const j = JSON.parse(fs.readFileSync(p, "utf8"));
    return { path: "config/resumora-support-mail-dns-authority.json", recommendations: j };
  } catch {
    return { path: p, recommendations: null, parseError: true };
  }
}

module.exports = {
  verifySupportMailDns,
  scoreDns,
  authenticationPass,
  loadDnsAuthorityRecommendations,
};
