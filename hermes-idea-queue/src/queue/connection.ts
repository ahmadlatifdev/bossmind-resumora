import { Redis } from 'ioredis';
import { loadConfig } from '../config.js';

let redis: Redis | null = null;

export function getRedis(): Redis {
  if (redis) return redis;
  const cfg = loadConfig();
  redis = new Redis(cfg.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  });
  redis.on('error', (err: Error) => console.error('[redis]', err.message));
  return redis;
}

export async function closeRedis(): Promise<void> {
  if (!redis) return;
  await redis.quit();
  redis = null;
}
