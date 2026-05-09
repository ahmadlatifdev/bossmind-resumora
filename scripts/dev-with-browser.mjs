/**
 * Starts `next dev`, watches stdout for Local URL, opens default browser when ready.
 * Fallback: polls localhost ports 3000–3010 for /api/health.
 *
 * Usage: npm run dev (wired to this script). Plain Next: npm run dev:plain
 */
import { exec, spawn } from "child_process";
import http from "http";

let opened = false;
let buffer = "";

function openBrowser(url) {
  if (opened) return;
  opened = true;
  const u = url.replace(/"/g, "");
  const cmd =
    process.platform === "win32"
      ? `start "" "${u}"`
      : process.platform === "darwin"
        ? `open "${u}"`
        : `xdg-open "${u}"`;
  exec(cmd, () => {});
}

function tryOpenFromPorts() {
  if (opened) return;
  const ports = [3000, 3001, 3002, 3003, 3004, 3005, 3006, 3007, 3008, 3009, 3010];

  for (const port of ports) {
    const req = http.get(`http://127.0.0.1:${port}/api/health`, { timeout: 400 }, (res) => {
      res.resume();
      if (!opened && res.statusCode === 200) {
        openBrowser(`http://localhost:${port}`);
      }
    });
    req.on("error", () => {});
    req.on("timeout", () => {
      req.destroy();
    });
  }
}

const child = spawn("npx", ["next", "dev"], {
  stdio: ["inherit", "pipe", "pipe"],
  shell: true,
  env: { ...process.env },
});

child.stdout?.on("data", (chunk) => {
  const s = chunk.toString();
  process.stdout.write(s);
  buffer = (buffer + s).slice(-12000);
  const local = buffer.match(/http:\/\/localhost:(\d+)/);
  if (local && !opened) {
    openBrowser(`http://localhost:${local[1]}`);
    return;
  }
  const tlsLocal = buffer.match(/https:\/\/localhost:(\d+)/);
  if (tlsLocal && !opened) {
    openBrowser(`https://localhost:${tlsLocal[1]}`);
  }
});

child.stderr?.on("data", (chunk) => {
  process.stderr.write(chunk);
  const s = chunk.toString();
  buffer += s;
});

const poll = setInterval(() => {
  tryOpenFromPorts();
  if (opened) clearInterval(poll);
}, 800);

child.on("exit", (code) => {
  clearInterval(poll);
  process.exit(code ?? 0);
});
