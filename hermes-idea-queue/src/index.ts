import { loadConfig } from './config.js';
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
