import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { gpmClient } from "../src/lib/gpm-api";

async function scanAndImport() {
  console.log("🚀 Starting scan from GPMLogin...");
  const gpmResult = await gpmClient.listProfiles(1, 100);
  console.log("Profiles in GPMLogin:", gpmResult?.data);

  if (!gpmResult?.data || gpmResult.data.length === 0) {
    console.log("No profiles found in GPMLogin.");
    return;
  }

  for (const p of gpmResult.data) {
    let cleanUsername = p.name.toLowerCase().replace(/[^a-z0-9_]/g, "_");
    if (cleanUsername.startsWith("tiktok_")) {
      cleanUsername = cleanUsername.replace(/^tiktok_/, "");
    }

    const existing = await prisma.tiktokAccount.findFirst({
      where: {
        OR: [{ gpmProfileId: p.id }, { username: cleanUsername }],
      },
    });

    if (!existing) {
      const created = await prisma.tiktokAccount.create({
        data: {
          username: cleanUsername,
          country: "US",
          groupName: "GPMLogin Fleet",
          gpmProfileId: p.id,
          status: "ACTIVE",
          totalViews: BigInt(0),
          totalFollowers: 0,
          totalVideos: 0,
          totalRevenue: 0,
          lastSyncedAt: new Date(),
        },
      });
      console.log(`✅ Successfully imported new account: @${created.username} (GPM ID: ${p.id})`);
    } else {
      console.log(`ℹ️ Account already linked: @${existing.username} (GPM ID: ${p.id})`);
    }
  }

  const allAccounts = await prisma.tiktokAccount.findMany();
  console.log(`\n📋 Current fleet accounts in DB (${allAccounts.length} accounts):`);
  allAccounts.forEach((acc) => {
    console.log(`- @${acc.username} | GPM: ${acc.gpmProfileId || "N/A"} | Status: ${acc.status}`);
  });
}

scanAndImport()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
