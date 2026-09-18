/**
 * Executes async tasks over an array with controlled concurrency.
 * Ensures zero-dependency, bounded concurrency that never exhausts database connection pools.
 * 
 * @param items Array of input items to process
 * @param mapper Async function executed per item
 * @param concurrency Maximum number of promises running simultaneously (default: 3)
 */
export async function pMap<T, R>(
  items: T[],
  mapper: (item: T, index: number) => Promise<R>,
  concurrency = 3
): Promise<R[]> {
  if (!items || items.length === 0) return [];
  const results: R[] = new Array(items.length);
  let currentIndex = 0;

  const workerCount = Math.min(concurrency, items.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (currentIndex < items.length) {
      const idx = currentIndex++;
      try {
        results[idx] = await mapper(items[idx], idx);
      } catch (err) {
        // Individual error logged, worker continues processing next item
        console.warn(`[pMap Worker] Error processing item index ${idx}:`, err);
        results[idx] = null as any;
      }
    }
  });

  await Promise.all(workers);
  return results;
}
