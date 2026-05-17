const fs = require("fs");
const path = require("path");
const {
  BRAND_LOGO_PUBLIC_FILE,
  BRAND_LOGO_SRC,
  BRAND_LOGO_FORBIDDEN_PATTERNS,
  BRAND_LOGO_LEGACY_ALIASES,
  readLockedLogoHash,
} = require("../marketing/brand-asset-authority");

const SCAN_DIRS = ["components", "pages", "lib/marketing"];

function loadAuthorityConfig(cwd) {
  const p = path.join(cwd, "config/bossmind-brand-asset-authority.json");
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function walkFiles(dir, acc, extRe = /\.(jsx|js|tsx|ts)$/) {
  if (!fs.existsSync(dir)) return acc;
  for (const name of fs.readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walkFiles(p, acc, extRe);
    else if (extRe.test(name)) acc.push(p);
  }
  return acc;
}

function scanConflictingLogoSources(cwd) {
  const hits = [];
  const allowFiles = new Set([
    path.join(cwd, "components/brand/ResumoraLogo.tsx").replace(/\\/g, "/"),
    path.join(cwd, "lib/marketing/brand-asset-authority.js").replace(/\\/g, "/"),
    path.join(cwd, "lib/marketing/resumora-logo.js").replace(/\\/g, "/"),
    path.join(cwd, "lib/orchestration/bossmind-brand-asset-verify.js").replace(/\\/g, "/"),
    path.join(cwd, "scripts/bossmind-brand-asset-verify.mjs").replace(/\\/g, "/"),
    path.join(cwd, "scripts/bossmind-brand-asset-forbidden-scan.mjs").replace(/\\/g, "/"),
    path.join(cwd, "next.config.ts").replace(/\\/g, "/"),
    path.join(cwd, "public/sw.js").replace(/\\/g, "/"),
    path.join(cwd, "lib/marketing/seo-config.js").replace(/\\/g, "/"),
  ]);

  for (const rel of SCAN_DIRS) {
    const files = walkFiles(path.join(cwd, rel), []);
    for (const file of files) {
      const norm = file.replace(/\\/g, "/");
      if (allowFiles.has(norm)) continue;
      if (norm.includes("bossmind-baseline-snapshots")) continue;
      const text = fs.readFileSync(file, "utf8");
      for (const legacy of BRAND_LOGO_LEGACY_ALIASES) {
        if (text.includes(legacy) && !text.includes("BRAND_LOGO_LEGACY") && !text.includes("legacyAliases")) {
          hits.push({ file: path.relative(cwd, file), issue: `legacy_logo_path:${legacy}` });
        }
      }
      for (const forbidden of BRAND_LOGO_FORBIDDEN_PATTERNS) {
        if (text.toLowerCase().includes(forbidden.toLowerCase())) {
          hits.push({ file: path.relative(cwd, file), issue: `forbidden_pattern:${forbidden}` });
        }
      }
      if (
        /from\s+["']next\/image["']/.test(text) &&
        /resumora-logo/i.test(text) &&
        !norm.endsWith("ResumoraLogo.tsx")
      ) {
        hits.push({ file: path.relative(cwd, file), issue: "inline_logo_image_use_ResumoraLogo" });
      }
    }
  }

  const dupPaths = [
    path.join(cwd, "public/resumora-logo.png"),
    path.join(cwd, "public/resumora-logo.svg"),
  ];
  for (const dup of dupPaths) {
    if (fs.existsSync(dup)) {
      hits.push({ file: path.relative(cwd, dup), issue: "duplicate_logo_file_remove_or_rewrite_only" });
    }
  }

  return hits;
}

async function probeLiveLogo(origin, expectedHash) {
  const base = origin.replace(/\/$/, "");
  const urls = [`${base}${BRAND_LOGO_SRC}`, `${base}/resumora-logo.png`];
  const crypto = require("crypto");
  for (const url of urls) {
    const res = await fetch(url, { headers: { "cache-control": "no-cache" } });
    if (!res.ok) continue;
    const buf = Buffer.from(await res.arrayBuffer());
    const hash = crypto.createHash("sha256").update(buf).digest("hex");
    if (hash === expectedHash) {
      return { ok: true, url, status: res.status, hash, hashMatch: true };
    }
  }
  return { ok: false, url: urls[0], status: 404, hashMatch: false };
}

async function runBrandAssetVerification({ cwd = process.cwd(), origin = null, probeHtml = true } = {}) {
  const cfg = loadAuthorityConfig(cwd);
  const expectedHash = cfg.lockedLogo?.sha256;
  const actualHash = readLockedLogoHash(cwd);
  const hashOk = Boolean(expectedHash && actualHash && expectedHash === actualHash);
  const fileOk = fs.existsSync(path.join(cwd, BRAND_LOGO_PUBLIC_FILE));
  const conflicts = scanConflictingLogoSources(cwd);

  let htmlProbe = null;
  if (origin && probeHtml) {
    try {
      const res = await fetch(`${origin.replace(/\/$/, "")}/pricing`, {
        headers: { "cache-control": "no-cache" },
      });
      const html = await res.text();
      htmlProbe = {
        url: `${origin}/pricing`,
        status: res.status,
        hasLockedSrc: html.includes(BRAND_LOGO_SRC) || html.includes(encodeURIComponent(BRAND_LOGO_SRC)),
        hasBrandMarker: html.includes('data-rs-brand-logo="1"'),
        hasLegacySvg: html.includes("resumora-logo.svg"),
        hasLegacyRewrite:
          html.includes("resumora-logo.png") &&
          !html.includes("resumora-logo.svg"),
      };
    } catch (e) {
      htmlProbe = { error: e.message };
    }
  }

  let liveAsset = null;
  if (origin) {
    liveAsset = await probeLiveLogo(origin, expectedHash);
  }

  const ok =
    fileOk &&
    hashOk &&
    conflicts.length === 0 &&
    (!htmlProbe ||
      ((htmlProbe.hasLockedSrc || htmlProbe.hasLegacyRewrite) &&
        (htmlProbe.hasBrandMarker || htmlProbe.hasLegacyRewrite) &&
        !htmlProbe.hasLegacySvg)) &&
    (!liveAsset || liveAsset.hashMatch);

  return {
    ok,
    lockedPath: BRAND_LOGO_SRC,
    fileOk,
    hashOk,
    expectedHash,
    actualHash,
    conflicts,
    htmlProbe,
    liveAsset,
    blockDeploy: !ok,
  };
}

module.exports = {
  runBrandAssetVerification,
  scanConflictingLogoSources,
  probeLiveLogo,
};
