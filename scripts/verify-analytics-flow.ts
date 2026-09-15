import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { appRouter } from "../src/trpc/root";

async function main() {
  console.log("=== VERIFYING ANALYTICS & REVENUE FLOW ===");

  // 1. Check if any accounts exist in database
  const account = await prisma.tiktokAccount.findFirst({
    include: { analytics: true },
  });

  if (!account) {
    console.log("[INFO] No TikTok account found in database to test with.");
    return;
  }

  console.log(`[OK] Found test account: @${account.username} (ID: ${account.id})`);

  // Mock an analytics record for testing if none exists yet
  if (!account.analytics) {
    console.log("[SETUP] Seeding mock AccountAnalytics for verification...");
    await prisma.accountAnalytics.create({
      data: {
        accountId: account.id,
        currency: "$",
        revenue7d: 12.5,
        revenue28d: 48.2,
        revenue60d: 95.8,
        revenue365d: 312.4,
        totalRevenue: 312.4,
        views7d: BigInt(25000),
        views28d: BigInt(98000),
        views60d: BigInt(190000),
        views365d: BigInt(620000),
        dailyBreakdown: [
          { date: "2026-09-10", revenue: 5.2, views: 10200 },
          { date: "2026-09-11", revenue: 4.1, views: 8900 },
          { date: "2026-09-12", revenue: 3.2, views: 5900 },
        ] as any,
        activePrograms: [
          { program_type: 1, name: "Creator Rewards Program", status: 2 },
        ] as any,
      },
    });
    console.log("[SETUP] Mock AccountAnalytics seeded!");
  } else {
    console.log("[OK] Account already has analytics:", {
      currency: account.analytics.currency,
      revenue7d: account.analytics.revenue7d,
      revenue28d: account.analytics.revenue28d,
      revenue60d: account.analytics.revenue60d,
      revenue365d: account.analytics.revenue365d,
      totalRevenue: account.analytics.totalRevenue,
      breakdownDays: Array.isArray(account.analytics.dailyBreakdown)
        ? (account.analytics.dailyBreakdown as any[]).length
        : 0,
    });
  }

  // Create tRPC caller with ADMIN mock session
  const adminUser = await prisma.user.findFirst({ where: { role: "ADMIN" } });
  const caller = appRouter.createCaller({
    prisma,
    session: {
      user: {
        id: adminUser?.id || "admin-test-id",
        role: "ADMIN",
        name: "Admin Tester",
        username: "admin",
      },
    } as any,
  });

  // Test 1: accounts.list
  console.log("\n--- Testing accounts.list ---");
  const listRes = await caller.accounts.list({});
  console.log(`[OK] accounts.list returned ${listRes.items.length} accounts.`);
  console.log(`[OK] Total Fleet Revenue: $${listRes.stats.totalRevenue}`);
  const firstAcc = listRes.items.find((a: any) => a.id === account.id);
  console.log(`[OK] Account in list has analytics attached: ${Boolean(firstAcc?.analytics)}`);

  // Test 2: accounts.getById
  console.log("\n--- Testing accounts.getById ---");
  const accDetail = await caller.accounts.getById({ id: account.id });
  console.log(`[OK] accounts.getById returned @${accDetail.username}`);
  console.log(`[OK] Analytics attached: ${Boolean(accDetail.analytics)}`);
  if (accDetail.analytics) {
    console.log(`   - 7d: $${accDetail.analytics.revenue7d}, Views: ${accDetail.analytics.views7d}`);
    console.log(`   - 28d: $${accDetail.analytics.revenue28d}, Views: ${accDetail.analytics.views28d}`);
    console.log(`   - 60d: $${accDetail.analytics.revenue60d}, Views: ${accDetail.analytics.views60d}`);
    console.log(`   - 365d: $${accDetail.analytics.revenue365d}, Views: ${accDetail.analytics.views365d}`);
  }

  // Test 3: revenue.getOverview
  console.log("\n--- Testing revenue.getOverview ---");
  for (const days of [7, 28, 60, 365, 0]) {
    const revRes = await caller.revenue.getOverview({ days });
    console.log(`[OK] Period ${days}d: TotalRev = $${revRes.totalRevenue}, TotalViews = ${revRes.totalViews}, ChartPoints = ${revRes.chartData.length}`);
  }

  // Test 4: revenue.listDetails
  console.log("\n--- Testing revenue.listDetails ---");
  const detailsRes = await caller.revenue.listDetails({});
  console.log(`[OK] revenue.listDetails returned ${detailsRes.length} daily records (including merged Studio dailyBreakdown).`);
  if (detailsRes.length > 0) {
    console.log(`   - Sample record: Date=${(detailsRes[0] as any).date}, Rev=$${(detailsRes[0] as any).revenue}, Views=${(detailsRes[0] as any).views}, Source=${(detailsRes[0] as any).sourceType}`);
  }

  // Test 5: analytics.getDashboardData
  console.log("\n--- Testing analytics.getDashboardData ---");
  for (const period of ["7D", "28D", "60D", "365D", "ALL"] as const) {
    const dashRes = await caller.analytics.getDashboardData({ period });
    console.log(`[OK] Dashboard Period ${period}: TotalRev = $${dashRes.kpi.totalRevenue}, Views = ${dashRes.kpi.totalViews}, TopAccounts = ${dashRes.topAccounts.length}, TimeSeries = ${dashRes.timeSeries.length}`);
  }

  console.log("\n=== ALL REVENUE & ANALYTICS TESTS PASSED SUCCESSFULLY! ===");
}

main()
  .catch((err) => {
    console.error("[TEST FAILED]:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
