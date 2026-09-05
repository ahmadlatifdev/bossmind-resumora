import { Worker } from 'bullmq';
import { loadConfig } from '../config.js';
import { loadIdea, saveIdea } from '../safety/hitlStore.js';
import { runIdeaGraph } from '../orchestration/runner.js';
import { QUEUE_NAME, QA_QUEUE_NAME } from './queues.js';
function bullConnection() {
  const url = new URL(loadConfig().REDIS_URL);
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    password: url.password || undefined,
    username: url.username || undefined,
  };
}
async function handleJob(payload) {
  const idea = await loadIdea(payload.ideaId);
  if (!idea) throw new Error(`Idea not found: ${payload.ideaId}`);
  if (idea.status === 'awaiting_hitl') {
    console.log(`[worker] skip ${idea.id} — awaiting HITL`);
    return;
  }
  if (idea.status === 'rejected' || idea.status === 'done') return;
  idea.status = 'running';
  idea.qaAttempts = payload.attempt;
  if (payload.failureLog) idea.lastError = payload.failureLog.slice(0, 8000);
  await saveIdea(idea);
  const result = await runIdeaGraph({
    idea,
    attempt: payload.attempt,
    failureLog: payload.failureLog,
    trigger: payload.trigger,
  });
  await saveIdea(result.idea);
}
export function startWorkers() {
  const cfg = loadConfig();
  const taskWorker = new Worker(QUEUE_NAME, async (job) => handleJob(job.data), {
    connection: bullConnection(),
    concurrency: cfg.MAX_CONCURRENT_TASKS,
  });
  const qaWorker = new Worker(
    QA_QUEUE_NAME,
    async (job) => handleJob({ ...job.data, trigger: 'self_heal' }),
    {
      connection: bullConnection(),
      concurrency: 1,
    }
  );
  for (const w of [taskWorker, qaWorker]) {
    w.on('failed', (job, err) => {
      console.error(`[worker] job failed ${job?.id}`, err.message);
    });
    w.on('completed', (job) => {
      console.log(`[worker] completed ${job.id}`);
    });
  }
  return { taskWorker, qaWorker };
}
