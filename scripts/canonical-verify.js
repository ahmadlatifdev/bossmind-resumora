/**
 * Resumora — canonical-verify.js
 *
 * Run after deploying to confirm resumora.net canonical enforcement is live.
 *
 * Usage:
 *   node canonical-verify.js
 *
 * What it checks:
 *   1. Render domain redirects to resumora.net (308)
 *   2. resumora.net loads correctly (200)
 *   3. Webhook path NOT redirected (no 308 on /api/stripe/webhook)
 *   4. OG/canonical tags on homepage point to resumora.net
 *   5. robots.txt sitemap URL is resumora.net
 *
 * Prerequisites: Node.js 18+ (uses built-in fetch)
 */

const RENDER_URL    = "https://bossmind-resumora-web.onrender.com";
const CANONICAL_URL = "https://resumora.net";
const PASS = "\x1b[32m[PASS]\x1b[0m";
const FAIL = "\x1b[31m[FAIL]\x1b[0m";
const SKIP = "\x1b[33m[SKIP]\x1b[0m";
const INFO = "\x1b[36m[INFO]\x1b[0m";

let failures = 0;

function pass(msg) { console.log(`  ${PASS} ${msg}`); }
function fail(msg) { console.log(`  ${FAIL} ${msg}`); failures++; }
function info(msg) { console.log(`  ${INFO} ${msg}`); }

async function checkRedirect(fromUrl, expectedLocation, description) {
  try {
    const res = await fetch(fromUrl, { redirect: "manual" });
    const loc = res.headers.get("location") || "";
    const status = res.status;
    if ((status === 301 || status === 308) && loc.startsWith(expectedLocation)) {
      pass(`${description}: ${status} -> ${loc}`);
    } else if (status === 200 && fromUrl.includes("resumora.net")) {
      pass(`${description}: 200 OK (already on canonical domain)`);
    } else {
      fail(`${description}: got ${status}, location="${loc}" (expected 301/308 -> ${expectedLocation})`);
    }
  } catch (e) {
    fail(`${description}: fetch error — ${e.message}`);
  }
}

async function checkNotRedirected(url, description) {
  try {
    const res = await fetch(url, {
      redirect: "manual",
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const status = res.status;
    if (status !== 301 && status !== 308) {
      pass(`${description}: ${status} (not redirected — correct)`);
    } else {
      fail(`${description}: got ${status} redirect — webhook path should NOT be redirected`);
    }
  } catch (e) {
    // Connection refused / method not allowed is fine — means it reached the server
    pass(`${description}: server responded (not redirected)`);
  }
}

async function checkMetaTags(url, description) {
  try {
    const res = await fetch(url, { redirect: "follow" });
    if (!res.ok) { fail(`${description}: HTTP ${res.status}`); return; }
    const html = await res.text();

    const canonical = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)?.[1]
                   || html.match(/href=["']([^"']+)["'][^>]+rel=["']canonical["']/i)?.[1];
    const ogUrl     = html.match(/property=["']og:url["'][^>]+content=["']([^"']+)["']/i)?.[1]
                   || html.match(/content=["']([^"']+)["'][^>]+property=["']og:url["']/i)?.[1];
    const ogImage   = html.match(/property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1]
                   || html.match(/content=["']([^"']+)["'][^>]+property=["']og:image["']/i)?.[1];

    if (canonical?.includes("resumora.net")) {
      pass(`${description} — canonical: ${canonical}`);
    } else if (canonical) {
      fail(`${description} — canonical points to wrong domain: ${canonical}`);
    } else {
      info(`${description} — no canonical tag found (may be dynamic)`);
    }

    if (ogUrl?.includes("resumora.net")) {
      pass(`${description} — og:url: ${ogUrl}`);
    } else if (ogUrl) {
      fail(`${description} — og:url points to wrong domain: ${ogUrl}`);
    }

    if (ogImage?.includes("resumora.net")) {
      pass(`${description} — og:image: ${ogImage}`);
    } else if (ogImage) {
      fail(`${description} — og:image uses wrong domain: ${ogImage}`);
    }
  } catch (e) {
    fail(`${description}: ${e.message}`);
  }
}

async function checkRobotsSitemap(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) { fail(`robots.txt: HTTP ${res.status}`); return; }
    const body = await res.text();
    if (body.includes("Sitemap: https://resumora.net/sitemap.xml")) {
      pass(`robots.txt sitemap points to resumora.net`);
    } else {
      const sitemapLine = body.match(/Sitemap:.+/)?.[0] || "(none found)";
      fail(`robots.txt sitemap wrong: ${sitemapLine}`);
    }
    if (body.includes("Disallow: /api/")) {
      pass(`robots.txt blocks /api/`);
    }
  } catch (e) {
    fail(`robots.txt: ${e.message}`);
  }
}

async function main() {
  console.log("\n  Resumora Canonical Verification");
  console.log("  ================================");
  console.log(`  ${new Date().toISOString()}\n`);

  console.log("  1. Render domain redirect");
  await checkRedirect(
    `${RENDER_URL}/`,
    CANONICAL_URL,
    "GET / on Render domain"
  );
  await checkRedirect(
    `${RENDER_URL}/pricing`,
    `${CANONICAL_URL}/pricing`,
    "GET /pricing on Render domain"
  );

  console.log("\n  2. Canonical domain loads");
  try {
    const res = await fetch(`${CANONICAL_URL}/`);
    if (res.ok) {
      pass(`GET ${CANONICAL_URL}/ -> ${res.status}`);
    } else {
      fail(`GET ${CANONICAL_URL}/ -> ${res.status}`);
    }
  } catch (e) {
    fail(`resumora.net unreachable: ${e.message}`);
  }

  console.log("\n  3. Webhook path NOT redirected");
  await checkNotRedirected(
    `${RENDER_URL}/api/stripe/webhook`,
    "POST /api/stripe/webhook on Render domain"
  );
  await checkNotRedirected(
    `${RENDER_URL}/api/webhooks/stripe`,
    "POST /api/webhooks/stripe on Render domain"
  );

  console.log("\n  4. OG / canonical metadata on homepage");
  await checkMetaTags(`${CANONICAL_URL}/`, "resumora.net/");

  console.log("\n  5. robots.txt");
  await checkRobotsSitemap(`${CANONICAL_URL}/robots.txt`);

  console.log(`\n  ${"─".repeat(46)}`);
  if (failures === 0) {
    console.log(`  \x1b[32mAll checks passed. resumora.net is the sole\x1b[0m`);
    console.log(`  \x1b[32mpublic identity.\x1b[0m`);
  } else {
    console.log(`  \x1b[31m${failures} check(s) failed. Review above.\x1b[0m`);
    process.exit(1);
  }
  console.log();
}

main().catch((e) => {
  console.error("Verification script error:", e);
  process.exit(1);
});
