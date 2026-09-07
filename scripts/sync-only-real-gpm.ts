import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { gpmClient } from "../src/lib/gpm-api";

async function cleanAndLoadFromGpm() {
  console.log("🧹 Clearing all mock/seed data...");

  // 1. Delete all mock records
  await prisma.dailyRevenue.deleteMany({});
  await prisma.dailyChecklistItem.deleteMany({});
  await prisma.dailyChecklist.deleteMany({});
  await prisma.accountAlert.deleteMany({});
  await prisma.accountLog.deleteMany({});
  await prisma.tiktokAccount.deleteMany({});

  console.log("✅ All mock data cleared.");

  // 2. Ensure Admin & Staff users exist for assignment
  const existingUsers = await prisma.user.findMany();
  let defaultUser = existingUsers[0];

  if (!defaultUser) {
    defaultUser = await prisma.user.create({
      data: {
        username: "admin",
        name: "Quản Trị Viên (Admin)",
        email: "admin@tiktokflow.io",
        role: "ADMIN",
      },
    });
    console.log("👤 Created default admin user");
  }

  // 3. Fetch real profiles directly from GPMLogin Local API
  console.log("🔍 Fetching real profiles from GPMLogin (http://localhost:9495/api/v1)...");
  const gpmResult = await gpmClient.listProfiles(1, 100);

  if (!gpmResult?.data || gpmResult.data.length === 0) {
    console.log("ℹ️ No profiles found in GPMLogin application yet.");
    console.log("👉 Please create a profile in GPMLogin or click 'Auto Scan' in web UI whenever you add one.");
    return;
  }

  console.log(`📥 Found ${gpmResult.data.length} real profiles in GPMLogin:`);

  for (const p of gpmResult.data) {
    let cleanUsername = p.name.toLowerCase().replace(/[^a-z0-9_]/g, "_");
    if (cleanUsername.startsWith("tiktok_")) {
      cleanUsername = cleanUsername.replace(/^tiktok_/, "");
    }

    const created = await prisma.tiktokAccount.create({
      data: {
        username: cleanUsername,
        country: "US",
        groupName: "GPMLogin Fleet",
        gpmProfileId: p.id,
        status: "ACTIVE",
        assignedUserId: defaultUser.id,
        totalViews: BigInt(0),
        totalFollowers: 0,
        totalVideos: 0,
        totalRevenue: 0,
        lastSyncedAt: new Date(),
      },
    });

    await prisma.accountLog.create({
      data: {
        accountId: created.id,
        newStatus: "ACTIVE",
        logType: "STATUS_CHANGE",
        message: `Được tải trực tiếp từ GPMLogin Profile: "${p.name}" (ID: ${p.id})`,
        actorName: "GPMLogin Sync",
      },
    });

    console.log(`✅ Loaded real profile from GPMLogin: @${created.username} (GPM ID: ${p.id})`);
  }

  console.log("\n🎉 Database now contains ONLY real profiles from your GPMLogin application!");
}

cleanAndLoadFromGpm()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
