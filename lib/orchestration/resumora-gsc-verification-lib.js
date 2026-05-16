/**
 * Google Search Console ownership verification recovery (DNS TXT + HTML meta + optional API).
 * Preserves email DNS (SPF/DMARC/DKIM) — only analyzes TXT; never mutates DNS.
 */
const dns = require("node:dns/promises");
const fs = require("node:fs");
const path = require("node:path");
const { verifySupportMailDns } = require("./resumora-support-mail-dns.js");

const GSC_PREFIX = "google-site-verification=";
const PUBLIC_RESOLVERS = [
  { id: "system", servers: null },
  { id: "google", servers: ["8.8.8.8", "8.8.4.4"] },
  { id: "cloudflare", servers: ["1.1.1.1", "1.0.0.1"] },
  { id: "quad9", servers: ["9.9.9.9", "149.112.112.112"] },
];

function normalizeTxtRecord(raw) {
  return String(raw || "")
    .replace(/\s+/g, "")
    .trim();
}

function parseGoogleVerificationTxt(txt) {
  const n = normalizeTxtRecord(txt);
  const lower = n.toLowerCase();
  if (!lower.includes("google-site-verification")) return { kind: "other", raw: txt, normalized: n };

  if (lower.startsWith(GSC_PREFIX)) {
    const token = n.slice(GSC_PREFIX.length);
    const invalidTrailing = /[^A-Za-z0-9_-]/.test(token);
    const malformed = !token || token.length < 20 || /\s/.test(token) || invalidTrailing;
    return {
      kind: "gsc_txt",
      raw: txt,
      normalized: n,
      token,
      malformed,
      malformedReason: malformed
        ? invalidTrailing
          ? "token_contains_invalid_characters"
          : token.length < 20
            ? "token_too_short"
            : "token_invalid"
        : null,
    };
  }

  const m = n.match(/google-site-verification=([A-Za-z0-9_-]+)/i);
  if (m) {
    return {
      kind: "gsc_txt_embedded",
      raw: txt,
      normalized: n,
      token: m[1],
      malformed: false,
      note: "verification string embedded in longer TXT",
    };
  }

  return { kind: "gsc_malformed", raw: txt, normalized: n, malformed: true };
}

async function resolveTxtAt(domain, servers) {
  if (servers?.length) dns.setServers(servers);
  try {
    const chunks = await dns.resolveTxt(domain);
    return { ok: true, records: chunks.flat().map((s) => String(s).trim()) };
  } catch (e) {
    return { ok: false, error: e.code || e.message || String(e), records: [] };
  } finally {
    if (servers?.length) dns.setServers([]);
  }
}

async function scanGlobalPropagation(domain) {
  const results = [];
  for (const r of PUBLIC_RESOLVERS) {
    const out = await resolveTxtAt(domain, r.servers);
    if (!out.ok) {
      results.push({ resolver: r.id, ok: false, error: out.error, records: [] });
      continue;
    }
    const gsc = out.records.filter((t) => /google-site-verification/i.test(t)).map(parseGoogleVerificationTxt);
    results.push({
      resolver: r.id,
      ok: true,
      txtCount: out.records.length,
      gscTokens: [...new Set(gsc.filter((x) => x.token).map((x) => x.token))],
      allTxt: out.records,
    });
  }
  const tokenSets = results.filter((x) => x.ok).map((x) => (x.gscTokens || []).sort().join("|"));
  const uniqueSets = [...new Set(tokenSets)];
  return {
    resolvers: results,
    globallyConsistent: uniqueSets.length <= 1,
    distinctGscTokenSets: uniqueSets,
  };
}

function analyzeGscConflicts(gscEntries, preferredToken) {
  const tokens = gscEntries.filter((e) => e.token).map((e) => e.token);
  const unique = [...new Set(tokens)];
  const duplicates = tokens.length - unique.length;
  const outdated = preferredToken ? unique.filter((t) => t !== preferredToken) : [];
  const conflicts = unique.length > 1;

  const recommendations = [];
  if (conflicts) {
    recommendations.push(
      `Multiple distinct google-site-verification tokens (${unique.length}). Keep only the token shown in Search Console for this property; remove stale tokens at your DNS host.`
    );
  }
  if (preferredToken && !unique.includes(preferredToken)) {
    recommendations.push(
      `Preferred token ${preferredToken.slice(0, 8)}… not found in DNS TXT. Add TXT: google-site-verification=${preferredToken} or update DNS to match GSC.`
    );
  }
  for (const t of outdated) {
    recommendations.push(`Remove outdated TXT token ${t.slice(0, 8)}… (superseded by active token).`);
  }
  for (const e of gscEntries.filter((x) => x.malformed)) {
    recommendations.push(
      `Remove or fix malformed google-site-verification TXT (${e.malformedReason || "invalid"}): ${String(e.raw).slice(0, 80)}`
    );
  }

  return {
    tokenCount: unique.length,
    tokens: unique,
    duplicateRecordCount: duplicates,
    outdatedTokens: outdated,
    hasConflict: conflicts,
    preferredTokenPresent: preferredToken ? unique.includes(preferredToken) : null,
    recommendations,
    recordsToRemove: outdated,
    activeToken: preferredToken && unique.includes(preferredToken) ? preferredToken : unique[0] || null,
  };
}

async function fetchHtmlVerification(origin) {
  const url = `${origin.replace(/\/$/, "")}/`;
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 20000);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: ac.signal,
      headers: { "user-agent": "ResumoraGscVerificationRecovery/1.0 (+https://resumora.net)" },
    });
    const html = await res.text();
    const m = html.match(/name=["']google-site-verification["']\s+content=["']([^"']+)["']/i);
    return {
      ok: res.ok,
      status: res.status,
      finalUrl: res.url,
      metaContent: m ? m[1].trim() : null,
      metaPresent: Boolean(m),
    };
  } catch (e) {
    return { ok: false, error: e.message || String(e), metaPresent: false, metaContent: null };
  } finally {
    clearTimeout(t);
  }
}

async function getGoogleAccessToken() {
  const refresh = process.env.GOOGLE_SEARCH_CONSOLE_REFRESH_TOKEN;
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET;
  if (!refresh || !clientId || !clientSecret) {
    return { ok: false, reason: "missing_oauth_credentials" };
  }
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refresh,
    grant_type: "refresh_token",
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, reason: "token_exchange_failed", detail: json.error || res.statusText };
  }
  return { ok: true, accessToken: json.access_token };
}

async function probeSearchConsoleApi(domain) {
  const tok = await getGoogleAccessToken();
  if (!tok.ok) return { skipped: true, reason: tok.reason, detail: tok.detail || null };

  const headers = { Authorization: `Bearer ${tok.accessToken}` };
  const siteCandidates = [
    `sc-domain:${domain}`,
    `https://${domain}/`,
    `https://www.${domain}/`,
  ];

  try {
    const res = await fetch("https://www.googleapis.com/webmasters/v3/sites", { headers });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, apiError: json.error?.message || res.statusText, status: res.status };
    }
    const entries = json.siteEntry || [];
    const matched = entries.filter((e) => {
      const u = String(e.siteUrl || "");
      return siteCandidates.some((c) => u === c) || u.includes(domain);
    });
    const verified = matched.some(
      (e) => e.permissionLevel && e.permissionLevel !== "siteUnverifiedUser"
    );
    return {
      ok: true,
      sitesListed: entries.length,
      matched,
      ownershipVerified: verified,
      permissionLevels: matched.map((e) => ({ siteUrl: e.siteUrl, permissionLevel: e.permissionLevel })),
      sitemapApiAccessible: verified,
      searchAnalyticsApiAccessible: verified,
      indexingAccessActive: verified,
    };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

function loadAuthority(repoRoot) {
  const p = path.join(repoRoot, "config", "resumora-gsc-verification-authority.json");
  if (!fs.existsSync(p)) return { path: null, authority: null };
  try {
    return { path: "config/resumora-gsc-verification-authority.json", authority: JSON.parse(fs.readFileSync(p, "utf8")) };
  } catch {
    return { path: p, authority: null, parseError: true };
  }
}

/**
 * @param {{ domain?: string, origin?: string, root?: string, preferredToken?: string, waitMs?: number }} opts
 */
async function runGscVerificationRecovery(opts = {}) {
  const domain = (opts.domain || "resumora.net").replace(/^www\./, "").trim();
  const origin = (opts.origin || process.env.RESUMORA_GOOGLE_AUDIT_ORIGIN || "https://resumora.net").replace(
    /\/$/,
    ""
  );
  const root = opts.root || process.cwd();
  const waitMs = Math.min(120_000, Math.max(0, Number(opts.waitMs) || 0));

  if (waitMs > 0) {
    await new Promise((r) => setTimeout(r, waitMs));
  }

  const authorityLoad = loadAuthority(root);
  const envHtmlToken = (process.env.NEXT_PUBLIC_GSC_VERIFICATION || "").trim();
  const preferredToken =
    (opts.preferredToken || authorityLoad.authority?.activeDnsToken || envHtmlToken || "").trim() || null;

  const [propagation, html, htmlWww, emailDns] = await Promise.all([
    scanGlobalPropagation(domain),
    fetchHtmlVerification(origin),
    fetchHtmlVerification(origin.replace("://resumora.net", "://www.resumora.net")),
    verifySupportMailDns(domain).catch((e) => ({ error: e.message })),
  ]);

  const systemTxt =
    propagation.resolvers.find((r) => r.resolver === "system" && r.ok)?.allTxt ||
    propagation.resolvers.find((r) => r.ok)?.allTxt ||
    [];

  const parsed = systemTxt.map(parseGoogleVerificationTxt);
  const gscTxt = parsed.filter((p) => p.kind === "gsc_txt" || p.kind === "gsc_txt_embedded");
  const nonGscTxt = parsed.filter((p) => p.kind === "other");
  const conflict = analyzeGscConflicts(gscTxt, preferredToken);

  const htmlEffective = html.metaPresent ? html : htmlWww.metaPresent ? htmlWww : html;
  const htmlDnsAlignment =
    preferredToken && htmlEffective.metaContent
      ? htmlEffective.metaContent === preferredToken
        ? "same_token_html_and_dns"
        : "html_token_differs_from_dns_preferred"
      : htmlEffective.metaContent
        ? "html_only"
        : preferredToken
          ? "dns_preferred_no_html_meta"
          : "none";

  const gscApi = await probeSearchConsoleApi(domain);

  const dnsTxtPass = Boolean(conflict.activeToken && conflict.preferredTokenPresent !== false);
  const propagationPass = propagation.globallyConsistent && dnsTxtPass;

  let verificationMethod = "dns_txt";
  let alternativeMethod = null;
  if (!dnsTxtPass && htmlEffective.metaPresent) {
    verificationMethod = "html_meta";
    alternativeMethod = "If DNS keeps failing, confirm domain property uses DNS TXT (not URL-prefix HTML only).";
  } else if (!dnsTxtPass && !htmlEffective.metaPresent) {
    alternativeMethod =
      "Safest fallback: HTML meta via NEXT_PUBLIC_GSC_VERIFICATION on Render + URL-prefix property, OR add correct DNS TXT for sc-domain property. Email DNS unchanged.";
  }

  const activation = {
    ownershipVerified: gscApi.ownershipVerified === true,
    domainPropertyActive: gscApi.matched?.some((m) => String(m.siteUrl || "").startsWith("sc-domain:")) || false,
    indexingAccessActive: gscApi.indexingAccessActive === true,
    searchAnalyticsActive: gscApi.searchAnalyticsActive === true,
    sitemapAccessActive: gscApi.sitemapApiAccessible === true,
    apiProbe: gscApi.skipped ? "skipped_no_oauth" : gscApi.ok ? "ok" : "error",
  };

  const overallPass =
    activation.ownershipVerified ||
    (propagationPass && conflict.activeToken && !conflict.hasConflict);

  return {
    generatedAt: new Date().toISOString(),
    domain,
    origin,
    waitMs,
    preferredTokenSource: opts.preferredToken
      ? "cli"
      : authorityLoad.authority?.activeDnsToken
        ? "authority_json"
        : envHtmlToken
          ? "NEXT_PUBLIC_GSC_VERIFICATION"
          : "none",
    preferredToken: preferredToken || null,
    activeVerificationToken: conflict.activeToken,
    dns: {
      allTxtRecords: systemTxt,
      googleVerificationRecords: gscTxt,
      nonGoogleTxtCount: nonGscTxt.length,
      conflict,
      propagation,
      propagationPass,
      emailPreservationNote:
        "SPF/DMARC/DKIM/MX were scanned separately and are NOT modified by this workflow. Remove only stale google-site-verification TXT rows.",
    },
    htmlVerification: htmlEffective,
    htmlVerificationApex: html,
    htmlVerificationWww: htmlWww,
    htmlDnsAlignment,
    verificationMethod,
    alternativeMethod,
    activation,
    emailDnsSummary: emailDns.authenticationSummary || emailDns.error || null,
    authorityTemplate: authorityLoad.path,
    recommendations: [
      ...conflict.recommendations,
      ...(propagation.globallyConsistent
        ? []
        : ["DNS propagation inconsistent across resolvers — wait for TTL (often 300–3600s) or lower TTL before changes."]),
      ...(activation.ownershipVerified
        ? ["Search Console API reports verified ownership — click Verify in UI if still pending (cache)."]
        : gscApi.skipped
          ? [
              "Set GOOGLE_SEARCH_CONSOLE_REFRESH_TOKEN + GOOGLE_OAUTH_CLIENT_ID/SECRET to auto-probe GSC API.",
              "Until then: open Search Console → property → Verify after DNS shows single correct TXT globally.",
            ]
          : ["GSC API did not confirm verification — fix DNS/HTML per recommendations then re-run this script."]),
    ],
    overallStatus: overallPass ? "PASS" : conflict.hasConflict || !dnsTxtPass ? "FAIL" : "WARN",
    disclaimer:
      "This script cannot delete DNS records at your registrar. It reports conflicts; apply removals in Cloudflare/Route53/etc. GSC dashboard Verify button may lag DNS by minutes.",
  };
}

async function lockVerificationToNeon(report, { notes = "" } = {}) {
  const neon = require("../shared/neon-memory.js");
  await neon.ensureSharedMemoryInitialized().catch(() => {});
  const sql = neon.getSqlClient();
  if (!sql) return { ok: false, reason: "NEON_DATABASE_URL unset" };

  const projectKey = process.env.BOSSMIND_PROJECT_KEY || "resumora";
  const memoryKey = "resumora:gsc_verification_authority";
  const payload = {
    lockedAt: new Date().toISOString(),
    domain: report.domain,
    activeVerificationToken: report.activeVerificationToken,
    preferredToken: report.preferredToken,
    recordsRecommendedForRemoval: report.dns?.conflict?.recordsToRemove || [],
    propagationPass: report.dns?.propagationPass,
    activation: report.activation,
    overallStatus: report.overallStatus,
    notes: String(notes).slice(0, 2000),
  };

  await sql`
    INSERT INTO automation_memory (project_key, memory_key, payload, updated_at)
    VALUES (${projectKey}, ${memoryKey}, ${JSON.stringify(payload)}::jsonb, NOW())
    ON CONFLICT (project_key, memory_key) DO UPDATE SET
      payload = EXCLUDED.payload,
      updated_at = NOW()
  `;

  await neon.saveEvent({
    projectKey,
    eventType: "resumora.gsc_verification.locked",
    severity: report.overallStatus === "PASS" ? "info" : "warning",
    source: "resumora-gsc-verification-recovery",
    eventKey: `gsc:${report.domain}:${payload.lockedAt}`,
    payload: {
      activeVerificationToken: report.activeVerificationToken,
      overallStatus: report.overallStatus,
      activation: report.activation,
    },
  });

  return { ok: true, projectKey, memoryKey, payload };
}

module.exports = {
  runGscVerificationRecovery,
  lockVerificationToNeon,
  parseGoogleVerificationTxt,
  scanGlobalPropagation,
};
