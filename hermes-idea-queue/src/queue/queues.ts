import { Queue, type ConnectionOptions } from 'bullmq';
import { loadConfig } from '../config.js';
import type { QueueJobPayload } from '../types.js';

export const QUEUE_NAME = 'hermes-idea-tasks';
export const QA_QUEUE_NAME = 'hermes-idea-qa-heal';

function connection(): ConnectionOptions {
  const url = new URL(loadConfig().REDIS_URL);
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    password: url.password || undefined,
    username: url.username || undefined,
  };
}

let taskQueue: Queue<QueueJobPayload> | null = null;
let qaQueue: Queue<QueueJobPayload> | null = null;

export function getTaskQueue(): Queue<QueueJobPayload> {
  if (!taskQueue) {
    taskQueue = new Queue<QueueJobPayload>(QUEUE_NAME, { connection: connection() });
  }
  return taskQueue;
}

export function getQaQueue(): Queue<QueueJobPayload> {
  if (!qaQueue) {
    qaQueue = new Queue<QueueJobPayload>(QA_QUEUE_NAME, { connection: connection() });
  }
  return qaQueue;
}

export async function enqueueIdea(
  payload: QueueJobPayload,
  opts?: { priority?: number; delayMs?: number }
): Promise<string> {
  const job = await getTaskQueue().add('run-idea', payload, {
    jobId: `${payload.ideaId}-a${payload.attempt}-${payload.trigger}`,
    priority: opts?.priority ?? 50,
    delay: opts?.delayMs,
    attempts: 1,
    removeOnComplete: 100,
    removeOnFail: 200,
  });
  return String(job.id);
}

export async function enqueueSelfHeal(payload: QueueJobPayload): Promise<string> {
  const job = await getQaQueue().add('self-heal', payload, {
    jobId: `heal-${payload.ideaId}-a${payload.attempt}`,
    attempts: 1,
    removeOnComplete: 50,
    removeOnFail: 100,
  });
  return String(job.id);
}
