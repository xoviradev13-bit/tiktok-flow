import "dotenv/config";
import { prisma } from "../src/lib/prisma";

async function main() {
  const userId = "cmts93y3t0000fssuw5gyqsar";

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      gpmLastSeenAt: true,
      gpmIsOnline: true,
      tiktokAccounts: {
        select: {
          id: true,
          username: true,
          gpmProfileId: true,
          lastSyncedAt: true,
          totalVideos: true,
        },
      },
    },
  });

  console.log("=== USER INFO ===");
  console.log({
    id: user?.id,
    email: user?.email,
    gpmLastSeenAt: user?.gpmLastSeenAt,
    gpmIsOnline: user?.gpmIsOnline,
    accountsCount: user?.tiktokAccounts.length,
  });

  console.log("\n=== USER ACCOUNTS ===");
  console.table(user?.tiktokAccounts);

  // Check recent sync queue jobs
  const jobs = await prisma.syncQueue.findMany({
    where: {
      OR: [
        { requestedById: userId },
        { targetScope: userId },
        { targetScope: `USER:${userId}` },
      ],
    },
    orderBy: { requestedAt: "desc" },
    take: 5,
    select: {
      id: true,
      status: true,
      targetScope: true,
      requestedAt: true,
      startedAt: true,
      completedAt: true,
      successCount: true,
      failCount: true,
      errorMessage: true,
      resultSummary: true,
    },
  });

  console.log("\n=== RECENT SYNC JOBS ===");
  console.table(jobs);

  // Check recent account logs
  const logs = await prisma.accountLog.findMany({
    where: {
      account: {
        assignedUserId: userId,
      },
    },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      id: true,
      createdAt: true,
      account: { select: { username: true } },
      logType: true,
      message: true,
    },
  });

  console.log("\n=== RECENT ACCOUNT LOGS ===");
  console.table(logs.map(l => ({
    time: l.createdAt.toISOString(),
    account: l.account.username,
    type: l.logType,
    msg: l.message?.slice(0, 80),
  })));

  // Check checklists & checklist items
  const checklists = await prisma.dailyChecklist.findMany({
    where: { userId },
    orderBy: { date: "desc" },
    take: 7,
    include: {
      items: {
        include: {
          account: { select: { username: true } },
        },
      },
    },
  });

  console.log("\n=== RECENT CHECKLISTS & ITEMS ===");
  for (const c of checklists) {
    console.log(`\nDate: ${c.date.toISOString().split("T")[0]} | isLocked: ${c.isLocked} | Score: ${c.workdayScore}`);
    console.table(c.items.map(it => ({
      account: it.account.username,
      isPosted: it.isPosted,
      isSynced: it.isSynced,
      videoSource: it.videoSource,
      videoSyncedAt: it.videoSyncedAt?.toISOString() || null,
      snapshotCount: Array.isArray(it.videosSnapshot) ? it.videosSnapshot.length : 0,
    })));
  }
}

main().catch(console.error).finally(() => process.exit(0));
