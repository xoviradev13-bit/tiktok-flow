// In-memory / optional KV Cache for tRPC queries
const memoryCache = new Map<string, { value: any; expiry: number }>();

export async function cachedQuery<T>(
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T | null>
): Promise<T | null> {
  const cached = memoryCache.get(key);
  if (cached && cached.expiry > Date.now()) {
    return cached.value as T;
  }

  const fresh = await fetcher();
  if (fresh === null) return null;

  memoryCache.set(key, {
    value: fresh,
    expiry: Date.now() + ttlSeconds * 1000,
  });

  return fresh;
}

export function trpcCacheKey(parts: (string | undefined | null)[]): string {
  return parts.filter(Boolean).join(":");
}

export async function invalidateCacheKey(key: string): Promise<void> {
  memoryCache.delete(key);
}
