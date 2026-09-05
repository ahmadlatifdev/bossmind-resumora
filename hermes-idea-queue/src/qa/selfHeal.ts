import { loadConfig } from '../config.js';
import { enqueueSelfHeal } from '../queue/queues.js';
import { loadIdea, saveIdea } from '../safety/hitlStore.js';

/**
 * Self-healing QA loop entry:
 * CI captures failing logs → POST/CLI here → requeue agent with failure context.
 * Caps at MAX_QA_RETRIES then marks failed for manual review.
 */
export async function handleSelfHeal(opts: {
  ideaId: string;
  failureLog: string;
  branch?: string;
}): Promise<{ ok: boolean; status: string; attempt: number }> {
  const cfg = loadConfig();
  const idea = await loadIdea(opts.ideaId);
  if (!idea) {
    throw new Error(`Unknown idea ${opts.ideaId}`);
  }

  const nextAttempt = (idea.qaAttempts || 0) + 1;
  if (nextAttempt > cfg.MAX_QA_RETRIES) {
    idea.status = 'failed';
    idea.lastError = opts.failureLog.slice(0, 8000);
    idea.qaAttempts = nextAttempt;
    await saveIdea(idea);
    return { ok: false, status: 'failed_manual_review', attempt: nextAttempt };
  }

  idea.status = 'retrying';
  idea.qaAttempts = nextAttempt;
  idea.lastError = opts.failureLog.slice(0, 8000);
  if (opts.branch) idea.branchName = opts.branch;
  await saveIdea(idea);

  await enqueueSelfHeal({
    ideaId: idea.id,
    attempt: nextAttempt,
    trigger: 'self_heal',
    failureLog: opts.failureLog,
  });

  return { ok: true, status: 'requeued', attempt: nextAttempt };
}

export function parseIdeaIdFromBranch(branch: string): string | null {
  const cfg = loadConfig();
  const prefix = cfg.BRANCH_PREFIX;
  if (!branch.startsWith(prefix)) return null;
  return branch.slice(prefix.length).toUpperCase();
}
