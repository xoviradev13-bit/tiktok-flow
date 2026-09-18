import dotenv from "dotenv";
dotenv.config();

async function checkDb() {
  const { prisma } = await import("../src/lib/prisma");
  console.log("=== Checking TiktokAccount table ===");
  const accounts = await prisma.tiktokAccount.findMany({
    orderBy: { updatedAt: "desc" },
    take: 5,
    include: {
      assignedUser: { select: { name: true, email: true } },
      dailyRevenues: { orderBy: { date: "desc" }, take: 3 },
      logs: { orderBy: { createdAt: "desc" }, take: 3 },
    },
  });

  for (const acc of accounts) {
    console.log(`\nAccount: @${acc.username} (ID: ${acc.id})`);
    console.log(`  Status: ${acc.status}`);
    console.log(`  isOnline: ${acc.isOnline}`);
    console.log(`  GPM Profile ID: ${acc.gpmProfileId}`);
    console.log(`  Followers: ${acc.totalFollowers}`);
    console.log(`  Videos: ${acc.totalVideos}`);
    console.log(`  Views: ${acc.totalViews?.toString()}`);
    console.log(`  Revenue: $${acc.totalRevenue}`);
    console.log(`  Country: ${acc.country}`);
    console.log(`  Assigned To: ${acc.assignedUser?.name || "Unassigned"}`);
    console.log(`  Last Synced: ${acc.lastSyncedAt}`);
    console.log(`  Daily Revenues count: ${acc.dailyRevenues.length}`);
    for (const dr of acc.dailyRevenues) {
      console.log(`    - Date: ${dr.date.toISOString().split("T")[0]}, Views: ${dr.views}, Rev: $${dr.revenue}, RPM: $${dr.rpm}`);
    }
    console.log(`  Recent Logs:`);
    for (const log of acc.logs) {
      console.log(`    - [${log.logType}] ${log.message} (${log.createdAt.toISOString()})`);
    }
  }
}

checkDb().catch(console.error);
