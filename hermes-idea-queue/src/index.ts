import { loadConfig, resetConfigCache } from './config.js';
import { loadBacklog } from './ingestion/loadBacklog.js';
import { triageIdeas } from './ingestion/triage.js';
import { saveIdea } from './safety/hitlStore.js';
import { startWorkers } from './queue/workers.js';
import { runNightlySweep, scheduleNightlySweeper } from './nightly/sweeper.js';
import { startMcpServer } from './mcp/server.js';
import { startHitlServer } from './hitl/server.js';
import { handleSelfHeal, parseIdeaIdFromBranch } from './qa/selfHeal.js';
import { closeRedis } from './queue/connection.js';
import { startAutoRecoveryMonitor, runRecoveryTick } from './recovery/autoRecovery.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

/** Load root + queue .env before config/auto-recovery (no extra deps). */
function bootstrapEnvFiles() {
  for (const rel of [
    '.env',
    '.env.local',
    'hermes-idea-queue/.env',
    'hermes-idea-queue/.env.local',
  ]) {
    const filePath = path.join(repoRoot, rel);
    if (!fs.existsSync(filePath)) continue;
    for (const raw of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim();
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] == null || process.env[key] === '') process.env[key] = value;
    }
  }
  resetConfigCache();
}

bootstrapEnvFiles();

async function cmdIngest(): Promise<void> {
  const cfg = loadConfig();
  const raw = await loadBacklog(cfg.BACKLOG_PATH);
  const triaged = await triageIdeas(raw);
  for (const idea of triaged) await saveIdea(idea);
  console.log(
    JSON.stringify(
      {
        ok: true,
        count: triaged.length,
        hitl: triaged.filter((i) => i.status === 'awaiting_hitl').map((i) => i.id),
        ready: triaged.filter((i) => i.status === 'triaged').map((i) => i.id),
      },
      null,
      2
    )
  );
}

async function cmdWorker(): Promise<void> {
  startWorkers();
  console.log('[main] workers online');
}

async function cmdAll(): Promise<void> {
  startHitlServer();
  startMcpServer(8791);
  startWorkers();
  scheduleNightlySweeper();
  startAutoRecoveryMonitor();
  console.log(
    '[main] all services online (hitl :8790, mcp :8791, workers, nightly cron, auto-recovery 10s)'
  );
}

async function cmdSelfHeal(): Promise<void> {
  const ideaId =
    process.env.IDEA_ID ||
    parseIdeaIdFromBranch(process.env.GITHUB_REF_NAME || process.env.BRANCH || '') ||
    '';
  const failureLog = process.env.FAILURE_LOG || '';
  if (!ideaId) throw new Error('IDEA_ID or branch feat/auto-issue-* required');
  if (!failureLog) throw new Error('FAILURE_LOG required');
  const out = await handleSelfHeal({
    ideaId,
    failureLog,
    branch: process.env.GITHUB_REF_NAME || process.env.BRANCH,
  });
  console.log(JSON.stringify(out));
  if (!out.ok) process.exitCode = 2;
}

async function main(): Promise<void> {
  const cmd = process.argv[2] || 'all';
  switch (cmd) {
    case 'ingest':
      await cmdIngest();
      await closeRedis();
      break;
    case 'worker':
      await cmdWorker();
      break;
    case 'sweep':
      console.log(await runNightlySweep());
      await closeRedis();
      break;
    case 'mcp':
      startMcpServer(8791);
      break;
    case 'hitl':
      startHitlServer();
      break;
    case 'self-heal':
      await cmdSelfHeal();
      await closeRedis();
      break;
    case 'recover':
      await runRecoveryTick();
      break;
    case 'auto-recovery':
      startHitlServer();
      startMcpServer(8791);
      startAutoRecoveryMonitor();
      console.log('[main] auto-recovery + hitl/mcp online');
      break;
    case 'all':
      await cmdAll();
      break;
    default:
      console.error(`Unknown command: ${cmd}`);
      process.exitCode = 1;
  }
}

main().catch(async (err) => {
  console.error(err);
  await closeRedis().catch(() => undefined);
  process.exit(1);
});
