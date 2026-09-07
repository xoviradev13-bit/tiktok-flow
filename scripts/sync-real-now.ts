import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { detectTikTokAccountFromGpm, findTikTokHandleInProfile } from "../src/lib/tiktok-extractor";

async function main() {
  console.log("🔍 Fetching accounts from DB...");
  const accounts = await prisma.tiktokAccount.findMany();
  console.log(`Found ${accounts.length} accounts in DB.`);

  for (const acc of accounts) {
    console.log(`\nProcessing account: ${acc.username} (GPM ID: ${acc.gpmProfileId})`);
    if (acc.gpmProfileId) {
      const realHandle = findTikTokHandleInProfile(acc.gpmProfileId);
      console.log(`Real handle detected: @${realHandle}`);

      const detected = await detectTikTokAccountFromGpm(acc.gpmProfileId);
      console.log("Detected stats:", detected);

      const realUsername = detected?.username || realHandle || acc.username;
      const realFollowers = detected?.followersCount || 0;
      const realVideos = detected?.videoCount || 0;
      const realViews = detected?.totalViews || 0;
      const realRevenue = 0; // Real revenue from TikTok Studio (0 for fresh accounts)

      const updated = await prisma.tiktokAccount.update({
        where: { id: acc.id },
        data: {
          username: realUsername,
          totalViews: BigInt(realViews),
          totalFollowers: realFollowers,
          totalVideos: realVideos,
          totalRevenue: realRevenue,
          lastSyncedAt: new Date(),
        },
      });

      console.log(`✅ Updated account ${acc.id}:`);
      console.log({
        id: updated.id,
        username: updated.username,
        country: updated.country,
        gpmProfileId: updated.gpmProfileId,
        groupName: updated.groupName,
        status: updated.status,
        totalViews: Number(updated.totalViews),
        totalFollowers: updated.totalFollowers,
        totalVideos: updated.totalVideos,
        totalRevenue: Number(updated.totalRevenue),
      });

      // Clear fake revenue records and create real zero record for today
      await prisma.dailyRevenue.deleteMany({
        where: { accountId: acc.id },
      });

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      await prisma.dailyRevenue.create({
        data: {
          accountId: acc.id,
          date: today,
          views: BigInt(realViews),
          rpm: 0,
          revenue: 0,
          sourceType: "CREATOR_REWARDS",
        },
      });
      console.log("✅ Daily revenue set to real 0.00");
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
