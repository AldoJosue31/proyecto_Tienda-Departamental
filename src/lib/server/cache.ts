import Redis from "ioredis";

type CachedValue = { value: string; expiresAt: number };

const memoryCache = new Map<string, CachedValue>();
let redis: Redis | undefined;

function client() {
  if (!process.env.REDIS_URL) return undefined;
  if (!redis) {
    redis = new Redis(process.env.REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: 500,
    });
  }
  return redis;
}

export const cacheMetrics = { hits: 0, misses: 0, fallbacks: 0 };

export async function cacheAside<T>(key: string, ttlSeconds: number, loader: () => Promise<T> | T) {
  const redisClient = client();
  if (redisClient) {
    try {
      if (redisClient.status === "wait") await redisClient.connect();
      const cached = await redisClient.get(key);
      if (cached) {
        cacheMetrics.hits += 1;
        return JSON.parse(cached) as T;
      }
      const value = await loader();
      await redisClient.set(key, JSON.stringify(value), "EX", ttlSeconds);
      cacheMetrics.misses += 1;
      return value;
    } catch {
      cacheMetrics.fallbacks += 1;
    }
  }

  const now = Date.now();
  const cached = memoryCache.get(key);
  if (cached && cached.expiresAt > now) {
    cacheMetrics.hits += 1;
    return JSON.parse(cached.value) as T;
  }

  const value = await loader();
  memoryCache.set(key, { value: JSON.stringify(value), expiresAt: now + ttlSeconds * 1000 });
  cacheMetrics.misses += 1;
  return value;
}

export async function invalidatePrefix(prefix: string) {
  for (const key of memoryCache.keys()) {
    if (key.startsWith(prefix)) memoryCache.delete(key);
  }

  const redisClient = client();
  if (!redisClient) return;
  try {
    if (redisClient.status === "wait") await redisClient.connect();
    let cursor = "0";
    do {
      const [nextCursor, keys] = await redisClient.scan(cursor, "MATCH", `${prefix}*`, "COUNT", 100);
      cursor = nextCursor;
      if (keys.length > 0) await redisClient.del(keys);
    } while (cursor !== "0");
  } catch {
    cacheMetrics.fallbacks += 1;
  }
}
