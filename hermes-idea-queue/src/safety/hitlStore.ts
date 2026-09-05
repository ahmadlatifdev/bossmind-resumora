import { loadConfig } from '../config.js';
import type { HitlDecision, TriagedIdea } from '../types.js';
import { getRedis } from '../queue/connection.js';

const IDEA_KEY = (id: string) => `idea-queue:idea:${id}`;
const HITL_LIST = 'idea-queue:hitl:pending';
const DECISIONS = 'idea-queue:hitl:decisions';

export async function saveIdea(idea: TriagedIdea): Promise<void> {
  const redis = getRedis();
  await redis.set(IDEA_KEY(idea.id), JSON.stringify(idea));
  if (idea.requiresHitl && idea.status === 'awaiting_hitl') {
    await redis.zadd(HITL_LIST, idea.priorityScore, idea.id);
  }
}

export async function loadIdea(id: string): Promise<TriagedIdea | null> {
  const raw = await getRedis().get(IDEA_KEY(id));
  if (!raw) return null;
  return JSON.parse(raw) as TriagedIdea;
}

export async function listHitlPending(): Promise<TriagedIdea[]> {
  const redis = getRedis();
  const ids = await redis.zrevrange(HITL_LIST, 0, 199);
  const out: TriagedIdea[] = [];
  for (const id of ids) {
    const idea = await loadIdea(id);
    if (idea && idea.status === 'awaiting_hitl') out.push(idea);
  }
  return out;
}

export async function applyHitlDecision(decision: HitlDecision): Promise<TriagedIdea> {
  const idea = await loadIdea(decision.ideaId);
  if (!idea) throw new Error(`Unknown idea ${decision.ideaId}`);
  const next: TriagedIdea = {
    ...idea,
    status: decision.decision === 'approve' ? 'approved' : 'rejected',
    requiresHitl: decision.decision === 'approve' ? false : idea.requiresHitl,
  };
  await saveIdea(next);
  const redis = getRedis();
  await redis.zrem(HITL_LIST, decision.ideaId);
  await redis.lpush(DECISIONS, JSON.stringify(decision));
  return next;
}

export function assertHitlToken(header: string | undefined): void {
  const cfg = loadConfig();
  const token = (header || '').replace(/^Bearer\s+/i, '').trim();
  if (!token || token !== cfg.HITL_TOKEN) {
    const err = new Error('Unauthorized');
    (err as Error & { statusCode?: number }).statusCode = 401;
    throw err;
  }
}
