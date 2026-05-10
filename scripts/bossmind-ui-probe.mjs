#!/usr/bin/env node
/**
 * HTTP probes for marketing routes (layout sanity without Playwright screenshots).
 * Requires a running dev/preview server — default http://127.0.0.1:3000
 */
import http from "http";
import https from "https";
import { URL } from "url";

const origin =
  process.env.BOSSMIND_PROBE_ORIGIN?.replace(/\/$/, "") || "http://127.0.0.1:3000";

const PATHS = [
  { path: "/", expect: ["Resumora", "</html>"] },
  { path: "/pricing", expect: ["</html>"] },
  { path: "/services", expect: ["</html>"] },
  { path: "/capabilities", expect: ["</html>"] },
  { path: "/contact", expect: ["</html>"] },
  { path: "/free-test", expect: ["</html>"] },
  { path: "/?lang=fr", expect: ["</html>"] },
];

function fetchText(urlString) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlString);
    const lib = u.protocol === "https:" ? https : http;
    const req = lib.request(
      urlString,
      {
        method: "GET",
        headers: { "user-agent": "BossMind-ui-probe/1.0", "accept-language": "en,fr" },
        timeout: 12000,
      },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (c) => {
          body += c;
          if (body.length > 2_500_000) req.destroy(new Error("response too large"));
        });
        res.on("end", () =>
          resolve({
            status: res.statusCode || 0,
            body,
            headers: res.headers,
          })
        );
      }
    );
    req.on("timeout", () => {
      req.destroy(new Error("timeout"));
    });
    req.on("error", reject);
    req.end();
  });
}

async function main() {
  const results = [];
  for (const probe of PATHS) {
    const url = `${origin}${probe.path}`;
    try {
      const r = await fetchText(url);
      const ok =
        r.status === 200 &&
        probe.expect.every((s) => r.body.includes(s)) &&
        r.body.length > 400;
      results.push({ url, ok, status: r.status, bytes: r.body.length });
    } catch (e) {
      results.push({ url, ok: false, error: e.message });
    }
  }
  const failed = results.filter((r) => !r.ok);
  console.log(JSON.stringify({ origin, results }, null, 2));
  if (failed.length) {
    console.error(`bossmind-ui-probe: ${failed.length} failure(s).`);
    process.exit(1);
  }
  console.log("bossmind-ui-probe: all probes passed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
