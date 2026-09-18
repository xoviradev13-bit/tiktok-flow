import "dotenv/config";
import { prisma } from "../src/lib/prisma.js";

async function main() {
  const all = await prisma.accountAnalytics.findMany({
    include: { account: true },
  });
  console.log(`=== Total AccountAnalytics rows: ${all.length} ===`);
  for (const a of all) {
    console.log(`Analytics ID: ${a.id} | Account: @${a.account?.username} (ID: ${a.accountId}) | UpdatedAt: ${a.updatedAt?.toISOString()}`);
    console.log(`  - sumRevenue:`, a.sumRevenue);
    console.log(`  - sumViews:`, a.sumViews);
  }
}

main().catch(console.error).finally(() => process.exit(0));
