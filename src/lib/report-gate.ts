/**
 * Caps concurrent /api/extension/report DB work so a multi-browser
 * identity storm cannot exhaust the shared pg pool.
 *
 * Default 4 matched agent auto-concurrency and was starving large analytics
 * writes when identity reports also held slots. Prefer env override.
 */
const MAX = Number(process.env.REPORT_DB_CONCURRENCY || 6);
let active = 0;
const waiters: Array<() => void> = [];

function makeRelease() {
  let done = false;
  return () => {
    if (done) return;
    done = true;
    active--;
    waiters.shift()?.();
  };
}

/** Resolves to a release fn, or null if we waited too long (caller should 503). */
export async function acquireReportSlot(
  maxWaitMs = 8000
): Promise<(() => void) | null> {
  if (active < MAX) {
    active++;
    return makeRelease();
  }
  const waitedFrom = Date.now();
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      const i = waiters.indexOf(grant);
      if (i >= 0) waiters.splice(i, 1);
      resolve(null);
    }, maxWaitMs);
    const grant = () => {
      clearTimeout(timer);
      active++;
      resolve(makeRelease());
    };
    waiters.push(grant);
    // Stash wait start so callers can log duration on timeout via reportGateStats.
    (grant as any).__waitedFrom = waitedFrom;
  });
}

export function reportGateStats() {
  return { active, waiting: waiters.length, max: MAX };
}
