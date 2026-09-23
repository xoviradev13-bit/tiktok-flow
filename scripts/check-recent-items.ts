import "dotenv/config";
import { prisma } from "../src/lib/prisma";

async function main() {
  const userId = "cmts93y3t0000fssuw5gyqsar";

  const checklists = await prisma.dailyChecklist.findMany({
    where: { userId },
    orderBy: { date: "desc" },
    take: 3,
    include: {
      items: {
        include: { account: { select: { username: true } } },
      },
    },
  });

  for (const c of checklists) {
    console.log(`\nDate: ${c.date.toISOString().split("T")[0]} | isLocked: ${c.isLocked} | completed: ${c.completedCount}/${c.totalAssigned}`);
    console.table(c.items.map(it => ({
      account: it.account.username,
      isPosted: it.isPosted,
      isSynced: it.isSynced,
      videoSource: it.videoSource,
      videoSyncedAt: it.videoSyncedAt?.toISOString() || null,
      snapshotCount: Array.isArray(it.videosSnapshot) ? it.videosSnapshot.length : 0,
    })));
  }

  // Check recent AccountAnalytics for these accounts
  const analytics = await prisma.accountAnalytics.findMany({
    where: {
      account: { assignedUserId: userId },
    },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: {
      account: { select: { username: true } },
      recordedAt: true,
      followersCount: true,
      totalViews: true,
      totalRevenue: true,
      source: true,
    },
  });

  console.log("\n=== RECENT ACCOUNT ANALYTICS ===");
  console.table(analytics.map(a => ({
    account: a.account.username,
    recordedAt: a.recordedAt.toISOString(),
    followers: a.followersCount,
    views: Number(a.totalViews),
    revenue: a.totalRevenue,
    source: a.source,
  })));

  await prisma.$disconnect();
}

main().catch(console.error);
