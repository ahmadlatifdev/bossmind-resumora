#!/usr/bin/env node
/**
 * Reads `.bossmind/watchdog/session.json` + tail of `events.jsonl`, writes HTML report.
 * Output: .bossmind/watchdog/dashboard.html
 */
import fs from "fs";
import path from "path";
import process from "node:process";
import http from "http";

const cwd = process.cwd();
const stateDir = path.join(cwd, ".bossmind", "watchdog");
const sessionPath = path.join(stateDir, "session.json");
const eventsPath = path.join(stateDir, "events.jsonl");
const outPath = path.join(stateDir, "dashboard.html");
const port = Number(process.env.BOSSMIND_WATCHDOG_PORT || process.env.PORT || 3001);

function tailLines(file, max = 80) {
  if (!fs.existsSync(file)) return [];
  const s = fs.readFileSync(file, "utf8");
  return s
    .trim()
    .split("\n")
    .filter(Boolean)
    .slice(-max);
}

function probeHealth() {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/api/health`, { timeout: 4000 }, (res) => {
      let b = "";
      res.setEncoding("utf8");
      res.on("data", (c) => {
        b += c;
      });
      res.on("end", () => resolve({ ok: res.statusCode === 200, status: res.statusCode, body: b }));
    });
    req.on("error", () => resolve({ ok: false, status: 0, body: "" }));
    req.on("timeout", () => {
      req.destroy();
      resolve({ ok: false, status: 0, body: "" });
    });
  });
}

async function main() {
  const health = await probeHealth();
  let session = null;
  try {
    session = JSON.parse(fs.readFileSync(sessionPath, "utf8"));
  } catch {
    session = { error: "no session (watchdog not running?)" };
  }
  const lines = tailLines(eventsPath, 100).map((l) => {
    try {
      return JSON.parse(l);
    } catch {
      return { raw: l };
    }
  });

  const html = `<!doctype html><html><head><meta charset="utf-8"/><title>BossMind watchdog</title>
<style>body{font-family:system-ui;margin:24px;background:#0b0f14;color:#e6edf3} pre{background:#111820;padding:12px;border-radius:8px;overflow:auto;font-size:12px} .ok{color:#3fb950} .bad{color:#f85149} .kpi{display:inline-block;margin:8px;padding:10px 14px;border:1px solid #30363d;border-radius:8px}</style></head><body>
<h1>BossMind dev watchdog</h1>
<div class="kpi">Port <b>${port}</b></div>
<div class="kpi ${health.ok ? "ok" : "bad"}">/api/health <b>${health.ok ? "200" : "fail"}</b></div>
<h2>Session</h2><pre>${JSON.stringify(session, null, 2)}</pre>
<h2>Recent events (jsonl)</h2><pre>${JSON.stringify(lines, null, 2)}</pre>
<p class="bad">State path: ${stateDir} (gitignored)</p>
</body></html>`;

  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(outPath, html, "utf8");
  console.log(JSON.stringify({ written: outPath, healthOk: health.ok }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
