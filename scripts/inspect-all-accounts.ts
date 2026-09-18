import "dotenv/config";
import { prisma } from "../src/lib/prisma.js";

async function main() {
  const accounts = await prisma.tiktokAccount.findMany({
    include: {
      analytics: true,
      dailyRevenues: { take: 5 },
    },
  });

  console.log(`=== FOUND ${accounts.length} ACCOUNTS IN DATABASE ===`);
  for (const a of accounts) {
    console.log(`\nAccount: @${a.username} (ID: ${a.id}, GPM: ${a.gpmProfileId}, ProfileName: ${a.gpmProfileName})`);
    console.log(` - Status: ${a.status}`);
    console.log(` - Followers: ${a.totalFollowers}`);
    console.log(` - Views: ${a.totalViews}`);
    console.log(` - Revenue: ${a.totalRevenue}`);
    console.log(` - LastSyncedAt: ${a.lastSyncedAt?.toISOString()}`);
    console.log(` - Has Analytics: ${!!a.analytics}`);
    if (a.analytics) {
      console.log(`   - Analytics Updated: ${a.analytics.updatedAt?.toISOString()}`);
      console.log(`   - SumRevenue:`, a.analytics.sumRevenue);
      console.log(`   - SumViews:`, a.analytics.sumViews);
    }
  }
}

main().catch(console.error);
