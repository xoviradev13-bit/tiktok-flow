import { calculateWorkdayScore, getScoringConfig, getBusinessToday } from "@/lib/scoring-engine";

// Minimal structural type satisfied by both the extended and raw clients.
// Using a structural type avoids the extended-client / PrismaClient
// assignability problem.
export type ReconciliationClient = {
  dailyChecklist: {
    findFirst: (args: any) => Promise<any>;
    update: (args: any) => Promise<any>;
  };
  dailyChecklistItem: {
    createMany: (args: any) => Promise<any>;
    deleteMany: (args: any) => Promise<any>;
    findMany: (args: any) => Promise<any[]>;
  };
  tiktokAccount: {
    findMany: (args: any) => Promise<Array<{ id: string }>>;
  };
  $transaction: <T>(fn: (tx: ReconciliationClient) => Promise<T>) => Promise<T>;
};

export async function reconcileTodayChecklistForUser(
  prismaClient: ReconciliationClient,
  targetUserId: string
): Promise<void> {
  const { todayDateOnly } = getBusinessToday();

  const checklist = await prismaClient.dailyChecklist.findFirst({
    where: { userId: targetUserId, date: todayDateOnly, isLocked: false },
    include: { items: true },
  });
  if (!checklist) return;

  // Explicit deletedAt filter makes this safe with either extended or raw client.
  const activeAccounts = await prismaClient.tiktokAccount.findMany({
    where: {
      assignedUserId: targetUserId,
      deletedAt: null,
      status: { in: ["ACTIVE", "WARMING", "RESTRICTED"] },
    },
    select: { id: true },
  });

  const existingIds = new Set<string>(checklist.items.map((i: any) => i.accountId));
  const toAdd = activeAccounts.filter((a) => !existingIds.has(a.id));
  const activeIds = new Set(activeAccounts.map((a) => a.id));
  const toRemove = checklist.items.filter(
    (i: any) => !activeIds.has(i.accountId) && !i.isCompleted && !i.isPosted
  );

  if (toAdd.length === 0 && toRemove.length === 0) return;

  await prismaClient.$transaction(async (tx) => {
    if (toAdd.length) {
      await tx.dailyChecklistItem.createMany({
        data: toAdd.map((a) => ({ checklistId: checklist.id, accountId: a.id })),
        skipDuplicates: true,
      });
    }
    if (toRemove.length) {
      await tx.dailyChecklistItem.deleteMany({
        where: { id: { in: toRemove.map((i: any) => i.id) } },
      });
    }

    const remaining = await tx.dailyChecklistItem.findMany({
      where: { checklistId: checklist.id },
    });
    const totalAssigned = remaining.length;
    const completedCount = remaining.filter((i: any) => i.isCompleted || i.isPosted).length;
    const scoringConfig = await getScoringConfig(tx as any);
    const { completionRate, workdayScore } = calculateWorkdayScore(
      totalAssigned,
      completedCount,
      scoringConfig
    );

    await tx.dailyChecklist.update({
      where: { id: checklist.id },
      data: { totalAssigned, completedCount, completionRate, workdayScore },
    });
  });
}

/**
 * Post-commit reconciliation wrapper. Failures are logged, not thrown,
 * because the primary state change has already committed and the client
 * should not receive a false 500.
 */
export async function reconcileAfterCommit(
  prismaClient: ReconciliationClient,
  targetUserId: string,
  context: string
): Promise<void> {
  try {
    await reconcileTodayChecklistForUser(prismaClient, targetUserId);
  } catch (err) {
    console.error(`[${context}] checklist reconciliation failed for user ${targetUserId}:`, err);
  }
}
