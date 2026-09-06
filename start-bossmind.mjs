/**
 * start-bossmind.mjs
 * Starts hermes-idea-queue (HITL :8790 / MCP :8791) then Vite (:5173).
 * No new dependencies — uses Node child_process only.
 *
 * Flow:
 * 1. Detect HITL port (env / hermes .env / default 8790)
 * 2. Write HERMES_API_URL (+ VITE_HERMES_API_URL) into root .env
 * 3. Start hermes-idea-queue auto-recovery (hitl+mcp+monitor)
 * 4. Wait up to 10s for /api/health
 * 5. Start Vite
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const QUEUE_DIR = path.join(ROOT, 'hermes-idea-queue');
const HEALTH_TIMEOUT_MS = 10_000;
const HEALTH_POLL_MS = 400;

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m) continue;
    let val = m[2] ?? '';
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[m[1]] = val;
  }
  return out;
}

function detectHitlPort() {
  const fromProcess = Number(process.env.HITL_PORT || process.env.HERMES_HITL_PORT || '');
  if (Number.isFinite(fromProcess) && fromProcess > 0) return fromProcess;
  const queueEnv = {
    ...readEnvFile(path.join(QUEUE_DIR, '.env')),
    ...readEnvFile(path.join(QUEUE_DIR, '.env.local')),
  };
  const fromFile = Number(queueEnv.HITL_PORT || '');
  if (Number.isFinite(fromFile) && fromFile > 0) return fromFile;
  return 8790;
}

function upsertRootEnv(vars) {
  const envPath = path.join(ROOT, '.env');
  const existing = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
  const lines = existing ? existing.split(/\r?\n/) : [];
  const keys = new Set(Object.keys(vars));
  const next = [];
  for (const line of lines) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=/);
    if (m && keys.has(m[1])) continue;
    if (line.length || next.length) next.push(line);
  }
  while (next.length && next[next.length - 1] === '') next.pop();
  for (const [k, v] of Object.entries(vars)) {
    next.push(`${k}=${v}`);
  }
  next.push('');
  fs.writeFileSync(envPath, next.join('\n'), 'utf8');
  console.log(`[bossmind] wrote ${Object.keys(vars).join(', ')} → .env`);
}

async function waitForHealth(url, timeoutMs) {
  const started = Date.now();
  let lastErr = '';
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(1500) });
      if (res.ok) {
        console.log(`[bossmind] health OK ${url} (${Date.now() - started}ms)`);
        return true;
      }
      lastErr = `HTTP ${res.status}`;
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err);
    }
    await new Promise((r) => setTimeout(r, HEALTH_POLL_MS));
  }
  console.error(`[bossmind] health check failed after ${timeoutMs}ms: ${lastErr}`);
  return false;
}

function spawnLogged(label, command, args, cwd, env) {
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
  });
  const prefix = `[${label}] `;
  child.stdout?.on('data', (buf) => {
    for (const line of String(buf).split(/\r?\n/).filter(Boolean)) {
      console.log(prefix + line);
    }
  });
  child.stderr?.on('data', (buf) => {
    for (const line of String(buf).split(/\r?\n/).filter(Boolean)) {
      console.error(prefix + line);
    }
  });
  child.on('exit', (code, signal) => {
    console.error(`[bossmind] ${label} exited code=${code} signal=${signal || ''}`);
  });
  return child;
}

async function ensureQueueBuilt() {
  const entry = path.join(QUEUE_DIR, 'dist', 'index.js');
  if (fs.existsSync(entry)) return;
  console.log('[bossmind] building hermes-idea-queue…');
  await new Promise((resolve, reject) => {
    const child = spawn('npm', ['run', 'build'], {
      cwd: QUEUE_DIR,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`queue build ${code}`))));
  });
}

async function main() {
  const hitlPort = detectHitlPort();
  const mcpPort = Number(process.env.MCP_PORT || 8791) || 8791;
  const hermesApiUrl = `http://127.0.0.1:${hitlPort}`;

  upsertRootEnv({
    HERMES_API_URL: hermesApiUrl,
    VITE_HERMES_API_URL: hermesApiUrl,
    HITL_PORT: String(hitlPort),
    MCP_PORT: String(mcpPort),
  });

  await ensureQueueBuilt();

  console.log(`[bossmind] starting hermes-idea-queue (HITL :${hitlPort}, MCP :${mcpPort})…`);
  const queue = spawnLogged(
    'hermes',
    'node',
    ['dist/index.js', 'auto-recovery'],
    QUEUE_DIR,
    {
      HITL_PORT: String(hitlPort),
      MCP_PORT: String(mcpPort),
      HERMES_API_URL: hermesApiUrl,
    }
  );

  const healthy = await waitForHealth(`${hermesApiUrl}/api/health`, HEALTH_TIMEOUT_MS);
  if (!healthy) {
    queue.kill('SIGTERM');
    process.exit(1);
  }

  console.log('[bossmind] starting Vite on :5173…');
  const vite = spawnLogged(
    'vite',
    'npx',
    ['vite', '--host', '127.0.0.1', '--port', '5173'],
    ROOT,
    {
      HERMES_API_URL: hermesApiUrl,
      VITE_HERMES_API_URL: hermesApiUrl,
    }
  );

  const shutdown = () => {
    console.log('[bossmind] shutting down…');
    try {
      vite.kill('SIGTERM');
    } catch {
      /* ignore */
    }
    try {
      queue.kill('SIGTERM');
    } catch {
      /* ignore */
    }
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  vite.on('exit', (code) => {
    try {
      queue.kill('SIGTERM');
    } catch {
      /* ignore */
    }
    process.exit(code || 0);
  });
}

main().catch((err) => {
  console.error('[bossmind] fatal:', err instanceof Error ? err.message : err);
  process.exit(1);
});
