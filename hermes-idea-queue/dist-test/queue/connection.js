import { Redis } from 'ioredis';
import { loadConfig } from '../config.js';
let redis = null;
export function getRedis() {
  if (redis) return redis;
  const cfg = loadConfig();
  redis = new Redis(cfg.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  });
  redis.on('error', (err) => console.error('[redis]', err.message));
  return redis;
}
export async function closeRedis() {
  if (!redis) return;
  await redis.quit();
  redis = null;
}
