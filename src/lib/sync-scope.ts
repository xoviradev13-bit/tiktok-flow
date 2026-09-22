import { Prisma } from "@/generated/prisma/client";

export interface ParsedScope {
  USER?: string;
  PROFILE?: string;
  HANDLE?: string;
}

export function parseScope(scope: string | null | undefined): ParsedScope {
  if (!scope) return {};
  const out: ParsedScope = {};
  for (const segment of scope.split("|")) {
    const idx = segment.indexOf(":");
    if (idx === -1) continue;
    const key = segment.slice(0, idx);
    const value = segment.slice(idx + 1);
    if (key === "USER" || key === "PROFILE" || key === "HANDLE") {
      out[key] = value;
    }
  }
  return out;
}

export function scopeMatchesAccount(
  scope: string | null | undefined,
  account: { username?: string | null; gpmProfileId?: string | null }
): boolean {
  const parsed = parseScope(scope);
  if (account.gpmProfileId && parsed.PROFILE === account.gpmProfileId) return true;
  if (account.username && parsed.HANDLE === account.username) return true;
  return false;
}

/**
 * Cancels in-flight SyncQueue jobs for the given accounts.
 * Uses JS-side filtering to avoid substring-matching bugs.
 * Must be called inside a transaction (`tx`).
 *
 * COST NOTE (Fix #5): this pulls every PENDING/PROCESSING row system-wide.
 * Requires @@index([status]) on SyncQueue (see §2). Acceptable at current
 * volume; revisit with a scoped lookup if the in-flight queue grows large.
 */
export async function cancelInFlightSyncJobs(
  tx: Prisma.TransactionClient,
  accounts: Array<{ username?: string | null; gpmProfileId?: string | null }>
): Promise<void> {
  if (accounts.length === 0) return;

  const inFlight = await tx.syncQueue.findMany({
    where: { status: { in: ["PENDING", "PROCESSING"] } },
    select: { id: true, targetScope: true },
  });

  const toCancel = inFlight
    .filter((job) => accounts.some((acc) => scopeMatchesAccount(job.targetScope, acc)))
    .map((job) => job.id);

  if (toCancel.length === 0) return;

  await tx.syncQueue.updateMany({
    where: { id: { in: toCancel } },
    data: {
      status: "CANCELLED",
      completedAt: new Date(),
      errorMessage: "Account moved to Trash",
    },
  });
}
