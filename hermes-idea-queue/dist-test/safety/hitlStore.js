import { loadConfig } from '../config.js';
import { getRedis } from '../queue/connection.js';
const IDEA_KEY = (id) => `idea-queue:idea:${id}`;
const HITL_LIST = 'idea-queue:hitl:pending';
const DECISIONS = 'idea-queue:hitl:decisions';
export async function saveIdea(idea) {
  const redis = getRedis();
  await redis.set(IDEA_KEY(idea.id), JSON.stringify(idea));
  if (idea.requiresHitl && idea.status === 'awaiting_hitl') {
    await redis.zadd(HITL_LIST, idea.priorityScore, idea.id);
  }
}
export async function loadIdea(id) {
  const raw = await getRedis().get(IDEA_KEY(id));
  if (!raw) return null;
  return JSON.parse(raw);
}
export async function listHitlPending() {
  const redis = getRedis();
  const ids = await redis.zrevrange(HITL_LIST, 0, 199);
  const out = [];
  for (const id of ids) {
    const idea = await loadIdea(id);
    if (idea && idea.status === 'awaiting_hitl') out.push(idea);
  }
  return out;
}
export async function applyHitlDecision(decision) {
  const idea = await loadIdea(decision.ideaId);
  if (!idea) throw new Error(`Unknown idea ${decision.ideaId}`);
  const next = {
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
export function assertHitlToken(header) {
  const cfg = loadConfig();
  const token = (header || '').replace(/^Bearer\s+/i, '').trim();
  if (!token || token !== cfg.HITL_TOKEN) {
    const err = new Error('Unauthorized');
    err.statusCode = 401;
    throw err;
  }
}
