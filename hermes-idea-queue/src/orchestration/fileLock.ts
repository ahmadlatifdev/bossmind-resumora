import { getRedis } from '../queue/connection.js';
import { loadConfig } from '../config.js';

const lockKey = (filePath: string) => `idea-queue:filelock:${filePath.replace(/\\/g, '/')}`;

export async function acquireFileLocks(
  files: string[],
  owner: string
): Promise<{ ok: true; locked: string[] } | { ok: false; blockedBy: string }> {
  const redis = getRedis();
  const ttl = loadConfig().FILE_LOCK_TTL_SEC;
  const normalized = [...new Set(files.map((f) => f.replace(/\\/g, '/')).filter(Boolean))];
  const acquired: string[] = [];

  for (const file of normalized) {
    const key = lockKey(file);
    const result = await redis.set(key, owner, 'EX', ttl, 'NX');
    if (result !== 'OK') {
      const holder = (await redis.get(key)) || 'unknown';
      for (const f of acquired) await redis.del(lockKey(f));
      return { ok: false, blockedBy: `${file} held by ${holder}` };
    }
    acquired.push(file);
  }
  return { ok: true, locked: acquired };
}

export async function releaseFileLocks(files: string[], owner: string): Promise<void> {
  const redis = getRedis();
  for (const file of files) {
    const key = lockKey(file);
    const holder = await redis.get(key);
    if (holder === owner) await redis.del(key);
  }
}

export async function refreshFileLocks(files: string[], owner: string): Promise<void> {
  const redis = getRedis();
  const ttl = loadConfig().FILE_LOCK_TTL_SEC;
  for (const file of files) {
    const key = lockKey(file);
    const holder = await redis.get(key);
    if (holder === owner) await redis.expire(key, ttl);
  }
}
