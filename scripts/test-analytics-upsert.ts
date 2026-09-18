import "dotenv/config";
import { prisma } from "../src/lib/prisma.js";

async function main() {
  const account = await prisma.tiktokAccount.findFirst({
    where: { username: "user7300481501918" },
  });
  console.log("Testing AccountAnalytics upsert on:", account?.id);

  try {
    const res = await prisma.accountAnalytics.upsert({
      where: { accountId: account!.id },
      create: {
        accountId: account!.id,
        currency: "$",
        sumRevenue: { totalRevenue: 0 } as any,
        sumViews: { totalViews: 0 } as any,
        sumLikes: { totalLikes: 0 } as any,
        sumComments: {} as any,
        sumShares: {} as any,
        sumProfileViews: {} as any,
        revenueBreakdown: null,
        dailyRevenueBreakdown: [],
        insightsHistory: null,
        rawSnapshot: { test: true } as any,
      },
      update: {
        currency: "$",
      },
    });
    console.log("Upsert succeeded!", res);
  } catch (err: any) {
    console.error("Upsert FAILED with error:", err);
  }
}

main().catch(console.error);
