import { randomUUID } from "crypto";

let tableEnsured = false;

/**
 * Ensures the account_assignment_histories table and indexes exist in PostgreSQL.
 * If newly created or empty, bootstraps initial records for all currently assigned accounts.
 */
export async function ensureAssignmentHistoryTable(prisma: any): Promise<void> {
  if (tableEnsured) return;

  try {
    // 1. Create table if it doesn't exist
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "account_assignment_histories" (
        "id" TEXT PRIMARY KEY,
        "account_id" TEXT NOT NULL,
        "user_id" TEXT,
        "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "ended_at" TIMESTAMP(3),
        "transferred_by" TEXT,
        "reason" TEXT
      );
    `);

    // 2. Create indexes
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "account_assignment_histories_acc_idx" 
      ON "account_assignment_histories"("account_id");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "account_assignment_histories_usr_idx" 
      ON "account_assignment_histories"("user_id");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "account_assignment_histories_lookup_idx" 
      ON "account_assignment_histories"("account_id", "started_at", "ended_at");
    `);

    // 3. Bootstrap: If table is empty, seed active assignments so every currently assigned account has a started_at record
    const countRes: any = await prisma.$queryRawUnsafe(`
      SELECT COUNT(*)::int as count FROM "account_assignment_histories";
    `);
    const count = Number(countRes?.[0]?.count ?? 0);

    if (count === 0) {
      await prisma.$executeRawUnsafe(`
        INSERT INTO "account_assignment_histories" ("id", "account_id", "user_id", "started_at", "transferred_by", "reason")
        SELECT 
          'init_' || id,
          id,
          "assignedUserId",
          COALESCE("createdAt", NOW() - INTERVAL '30 days'),
          'System_Bootstrap',
          'Initial assignment state'
        FROM "tiktok_accounts"
        WHERE "assignedUserId" IS NOT NULL AND "deletedAt" IS NULL
        ON CONFLICT ("id") DO NOTHING;
      `);
    }

    tableEnsured = true;
  } catch (err: any) {
    console.warn("[assignment-history] Note on ensureAssignmentHistoryTable:", err?.message || err);
    // Don't crash caller if DB execution has intermittent issues
  }
}

/**
 * Record transfer of an account from old user to new user.
 */
export async function recordAccountTransfer(
  prisma: any,
  params: {
    accountId: string;
    newUserId: string | null;
    transferredBy?: string | null;
    reason?: string | null;
    effectiveAt?: Date;
  }
): Promise<void> {
  await ensureAssignmentHistoryTable(prisma);

  const effectiveAt = params.effectiveAt ?? new Date();
  const transferredBy = params.transferredBy ?? "System";
  const reason = params.reason ?? null;

  try {
    // Close any existing open assignment
    await prisma.$executeRawUnsafe(
      `
      UPDATE "account_assignment_histories"
      SET "ended_at" = $1
      WHERE "account_id" = $2 AND "ended_at" IS NULL
      `,
      effectiveAt,
      params.accountId
    );

    // If assigned to a new user, create a new active assignment record
    if (params.newUserId) {
      const newId = randomUUID();
      await prisma.$executeRawUnsafe(
        `
        INSERT INTO "account_assignment_histories" 
          ("id", "account_id", "user_id", "started_at", "ended_at", "transferred_by", "reason")
        VALUES ($1, $2, $3, $4, NULL, $5, $6)
        `,
        newId,
        params.accountId,
        params.newUserId,
        effectiveAt,
        transferredBy,
        reason
      );
    }
  } catch (err: any) {
    console.warn(`[assignment-history] Error recording transfer for account ${params.accountId}:`, err?.message || err);
  }
}

/**
 * Record bulk transfer of multiple accounts to a new user.
 */
export async function recordBulkAccountTransfer(
  prisma: any,
  params: {
    accountIds: string[];
    newUserId: string | null;
    transferredBy?: string | null;
    reason?: string | null;
    effectiveAt?: Date;
  }
): Promise<void> {
  if (!params.accountIds || params.accountIds.length === 0) return;
  await ensureAssignmentHistoryTable(prisma);

  const effectiveAt = params.effectiveAt ?? new Date();
  const transferredBy = params.transferredBy ?? "System";
  const reason = params.reason ?? null;

  try {
    for (const accountId of params.accountIds) {
      await recordAccountTransfer(prisma, {
        accountId,
        newUserId: params.newUserId,
        transferredBy,
        reason,
        effectiveAt,
      });
    }
  } catch (err: any) {
    console.warn("[assignment-history] Error recording bulk transfer:", err?.message || err);
  }
}

/**
 * Finds which user was assigned to an account on a given date / timestamp.
 *
 * Query rules:
 * 1. Check account_assignment_histories where:
 *      started_at <= targetDateEnd AND (ended_at IS NULL OR ended_at >= targetDateStart)
 *    Ordered by started_at DESC limit 1.
 * 2. Fallback: If not found, check DailyChecklistItem on that target date.
 * 3. Fallback: Current tiktokAccount.assignedUserId.
 */
export async function getAccountAssigneeAt(
  prisma: any,
  accountId: string,
  targetDate: Date
): Promise<string | null> {
  await ensureAssignmentHistoryTable(prisma);

  // Compute start and end of that calendar day (or use exact timestamp with buffer)
  const targetDateStart = new Date(targetDate);
  targetDateStart.setUTCHours(0, 0, 0, 0);

  const targetDateEnd = new Date(targetDate);
  targetDateEnd.setUTCHours(23, 59, 59, 999);

  try {
    const rows: any = await prisma.$queryRawUnsafe(
      `
      SELECT "user_id" 
      FROM "account_assignment_histories"
      WHERE "account_id" = $1
        AND "started_at" <= $2
        AND ("ended_at" IS NULL OR "ended_at" >= $3)
      ORDER BY "started_at" DESC
      LIMIT 1;
      `,
      accountId,
      targetDateEnd,
      targetDateStart
    );

    if (rows && rows.length > 0) {
      return rows[0].user_id ?? null;
    }
  } catch (err: any) {
    console.warn(`[assignment-history] Query error in getAccountAssigneeAt for account ${accountId}:`, err?.message || err);
  }

  // Fallback 1: Look at DailyChecklistItem for that account and date
  try {
    const histItem = await prisma.dailyChecklistItem.findFirst({
      where: {
        accountId,
        checklist: { date: targetDateStart },
      },
      include: { checklist: { select: { userId: true } } },
    });
    if (histItem?.checklist?.userId) {
      return histItem.checklist.userId;
    }
  } catch {
    // Ignore fallback lookup errors
  }

  // Fallback 2: Current assignedUserId on the TikTok account
  try {
    const acc = await prisma.tiktokAccount.findUnique({
      where: { id: accountId },
      select: { assignedUserId: true },
    });
    return acc?.assignedUserId ?? null;
  } catch {
    return null;
  }
}

/**
 * Returns all account IDs that belonged to a user on a specific past date.
 */
export async function getUserAccountIdsAt(
  prisma: any,
  userId: string,
  targetDate: Date
): Promise<string[]> {
  await ensureAssignmentHistoryTable(prisma);

  const targetDateStart = new Date(targetDate);
  targetDateStart.setUTCHours(0, 0, 0, 0);

  const targetDateEnd = new Date(targetDate);
  targetDateEnd.setUTCHours(23, 59, 59, 999);

  const accountIds = new Set<string>();

  try {
    const rows: any = await prisma.$queryRawUnsafe(
      `
      SELECT DISTINCT "account_id"
      FROM "account_assignment_histories"
      WHERE "user_id" = $1
        AND "started_at" <= $2
        AND ("ended_at" IS NULL OR "ended_at" >= $3)
      `,
      userId,
      targetDateEnd,
      targetDateStart
    );

    if (rows && rows.length > 0) {
      for (const r of rows) {
        if (r.account_id) accountIds.add(r.account_id);
      }
    }
  } catch (err: any) {
    console.warn(`[assignment-history] Query error in getUserAccountIdsAt for user ${userId}:`, err?.message || err);
  }

  // Fallback: Check DailyChecklistItem for that user on that date
  try {
    const items = await prisma.dailyChecklistItem.findMany({
      where: {
        checklist: {
          userId,
          date: targetDateStart,
        },
      },
      select: { accountId: true },
    });
    for (const it of items) {
      if (it.accountId) accountIds.add(it.accountId);
    }
  } catch {
    // Ignore fallback errors
  }

  return Array.from(accountIds);
}
