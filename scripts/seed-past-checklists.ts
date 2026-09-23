import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { getBusinessToday, getScoringConfig } from "../src/lib/scoring-engine";

async function main() {
  const userId = "cmts93y3t0000fssuw5gyqsar";
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, role: true },
  });

  if (!user) {
    console.error(`User with ID ${userId} not found.`);
    process.exit(1);
  }

  console.log(`Found user: ${user.name} (${user.email}, ${user.role}, ID: ${user.id})`);

  const scoringConfig = await getScoringConfig(prisma as any);
  const shouldExcludeBanned = scoringConfig.excludeBannedAccounts !== false;
  const allowedStatuses = shouldExcludeBanned
    ? ["ACTIVE", "WARMING", "RESTRICTED"]
    : ["ACTIVE", "WARMING", "RESTRICTED", "BANNED"];

  const accounts = await prisma.tiktokAccount.findMany({
    where: {
      assignedUserId: userId,
      status: { in: allowedStatuses as any },
      deletedAt: null,
    },
    select: { id: true, username: true, status: true, lastSyncedAt: true },
  });

  console.log(`Found ${accounts.length} assigned accounts for user:`);
  for (const acc of accounts) {
    console.log(`  - @${acc.username} (${acc.status}, ID: ${acc.id})`);
  }

  const { todayDateOnly, todayStr } = getBusinessToday();
  console.log(`\nToday (VN): ${todayStr} (UTC: ${todayDateOnly.toISOString()})`);

  // Parse YYYY-MM-DD from todayStr
  const [y, mo, d] = todayStr.split("-").map(Number);

  console.log("\nChecking / creating checklists for 6 days prior to today...\n");

  const results: any[] = [];

  for (let i = 1; i <= 6; i++) {
    const targetDate = new Date(Date.UTC(y, mo - 1, d - i));
    const targetDateStr = targetDate.toISOString().split("T")[0];

    const existing = await prisma.dailyChecklist.findUnique({
      where: {
        userId_date: {
          userId,
          date: targetDate,
        },
      },
      include: {
        items: true,
      },
    });

    if (existing) {
      results.push({
        day: `Today - ${i}`,
        date: targetDateStr,
        status: "already_exists",
        id: existing.id,
        isLocked: existing.isLocked,
        itemsCount: existing.items.length,
      });
      continue;
    }

    const created = await prisma.dailyChecklist.create({
      data: {
        userId,
        date: targetDate,
        totalAssigned: accounts.length,
        completedCount: 0,
        completionRate: 0,
        workdayScore: 0,
        isLocked: false,
        items: {
          create: accounts.map((acc) => ({
            accountId: acc.id,
            isPosted: false,
            isSynced: !!acc.lastSyncedAt,
            isCompleted: false,
          })),
        },
      },
      include: {
        items: true,
      },
    });

    results.push({
      day: `Today - ${i}`,
      date: targetDateStr,
      status: "created",
      id: created.id,
      isLocked: created.isLocked,
      itemsCount: created.items.length,
    });
  }

  console.table(results);
}

main()
  .catch((err) => {
    console.error("Error executing script:", err);
    process.exit(1);
  })
  .finally(() => {
    process.exit(0);
  });
