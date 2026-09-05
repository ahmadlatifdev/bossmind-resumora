import cron from 'node-cron';
import { loadConfig } from '../config.js';
import { loadBacklog } from '../ingestion/loadBacklog.js';
import { topologicalReady, triageIdeas } from '../ingestion/triage.js';
import { enqueueIdea } from '../queue/queues.js';
import { saveIdea, loadIdea } from '../safety/hitlStore.js';
/**
 * Nightly sweeper: ingest → triage → enqueue up to MAX_NIGHTLY_PRS atomic tasks.
 * Does NOT merge to main. Leaves PRs for morning human review.
 */
export async function runNightlySweep() {
  const cfg = loadConfig();
  const raw = await loadBacklog(cfg.BACKLOG_PATH);
  const triaged = await triageIdeas(raw);
  let enqueued = 0;
  let hitl = 0;
  let skipped = 0;
  const completed = new Set();
  for (const idea of triaged) {
    const existing = await loadIdea(idea.id);
    if (existing?.status === 'pr_ready' || existing?.status === 'done') {
      completed.add(idea.id);
    }
  }
  for (const idea of triaged) {
    await saveIdea(idea);
    if (idea.duplicateOf || idea.status === 'rejected') {
      skipped += 1;
      continue;
    }
    if (idea.status === 'awaiting_hitl') {
      hitl += 1;
      console.log(`[sweeper] HITL pause ${idea.id} flags=${idea.riskFlags.join(',')}`);
      continue;
    }
  }
  const ready = topologicalReady(
    triaged.map((i) => ({ ...i, status: i.status === 'triaged' ? 'queued' : i.status })),
    completed
  );
  for (const idea of ready) {
    if (enqueued >= cfg.MAX_NIGHTLY_PRS) break;
    if (idea.requiresHitl && idea.status === 'awaiting_hitl') continue;
    const fresh = (await loadIdea(idea.id)) || idea;
    if (
      fresh.status === 'awaiting_hitl' ||
      fresh.status === 'pr_ready' ||
      fresh.status === 'done'
    ) {
      skipped += 1;
      continue;
    }
    fresh.status = 'queued';
    await saveIdea(fresh);
    await enqueueIdea(
      { ideaId: fresh.id, attempt: 0, trigger: 'nightly' },
      { priority: Math.round(100 - fresh.priorityScore) }
    );
    enqueued += 1;
    console.log(
      `[sweeper] enqueued ${fresh.id} priority=${fresh.priorityScore} depth=${fresh.dagDepth}`
    );
  }
  console.log(`[sweeper] done enqueued=${enqueued} hitl=${hitl} skipped=${skipped}`);
  return { enqueued, hitl, skipped };
}
/** Cron: 2:00 AM local container time daily */
export function scheduleNightlySweeper() {
  cron.schedule('0 2 * * *', () => {
    void runNightlySweep().catch((err) => console.error('[sweeper] failed', err));
  });
  console.log('[sweeper] scheduled daily at 02:00');
}
