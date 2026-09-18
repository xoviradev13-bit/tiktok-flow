import "dotenv/config";
import { prisma } from "../src/lib/prisma";

async function main() {
  console.log("=== VERIFYING STRUCTURED ACCOUNT ANALYTICS ===");

  const account = await prisma.tiktokAccount.findFirst({
    where: { username: "dat.nguyen6284" },
    include: { analytics: true },
  });

  if (!account) {
    console.log("[INFO] No TikTok account found for @dat.nguyen6284");
    return;
  }

  console.log(`[OK] Found test account: @${account.username} (ID: ${account.id})`);

  const mockSumRevenue = {
    revenue7d: 0,
    revenue28d: 0,
    revenue60d: 0,
    revenue365d: 0,
    totalRevenue: 0,
  };

  const mockSumViews = {
    views7d: 3,
    views28d: 1054,
    views60d: 1054,
    views365d: 1054,
    totalViews: 1054,
  };

  const mockSumLikes = {
    likes7d: 0,
    likes28d: 15,
    likes60d: 15,
    likes365d: 15,
    totalLikes: 15,
  };

  const mockSumComments = {
    comments7d: 0,
    comments28d: 3,
    comments60d: 3,
    comments365d: 3,
  };

  const mockSumShares = {
    shares7d: 0,
    shares28d: 0,
    shares60d: 0,
    shares365d: 0,
  };

  const mockSumProfileViews = {
    profileViews7d: 0,
    profileViews28d: 7,
    profileViews60d: 7,
    profileViews365d: 7,
  };

  const mockRevenueBreakdown = {
    totalRevenue: { revenue7d: 0, revenue30d: 0, revenue60d: 0 },
    tiktokShop: { name: "TikTok Shop cho người bán", programId: 11, revenue7d: 0, revenue30d: 0, revenue60d: 0 },
    activePrograms: [],
  };

  const mockDailyRevenueBreakdown = [
    { date: "2026-09-15", revenue: 0 },
    { date: "2026-09-16", revenue: 0 },
  ];

  const mockRawSnapshot = {
    username: "dat.nguyen6284",
    updatedAt: new Date().toISOString(),
    viewsBreakdown: { viewsToday: 0, views7d: 3, views14d: 3, views30d: 1054, totalViews: 1054 },
    videosBreakdown: { videosToday: 0, videos7d: 0, videos14d: 0, videos30d: 3, totalVideos: 3 },
    videosList: [
      { id: "7682077203810553106", title: "software", views: 166, likes: 2, comments: 0, shares: 0, postDate: "Sep 5, 2026", coverUrl: "https://p16-sign.tiktokcdn.com/cover1.webp" },
      { id: "7682076720182217992", title: "Data Analysis", views: 603, likes: 12, comments: 0, shares: 0, postDate: "Sep 5, 2026", coverUrl: "https://p16-sign.tiktokcdn.com/cover2.webp" },
      { id: "7681871217019735303", title: "Foundation software", views: 240, likes: 1, comments: 0, shares: 0, postDate: "Sep 5, 2026", coverUrl: "https://p19-sign.tiktokcdn.com/cover3.webp" },
    ],
    topVideos: {},
  };

  // Upsert to AccountAnalytics
  console.log("[TEST] Upserting structured AccountAnalytics...");
  const updated = await prisma.accountAnalytics.upsert({
    where: { accountId: account.id },
    create: {
      accountId: account.id,
      currency: "$",
      sumRevenue: mockSumRevenue as any,
      sumViews: mockSumViews as any,
      sumLikes: mockSumLikes as any,
      sumComments: mockSumComments as any,
      sumShares: mockSumShares as any,
      sumProfileViews: mockSumProfileViews as any,
      revenueBreakdown: mockRevenueBreakdown as any,
      dailyRevenueBreakdown: mockDailyRevenueBreakdown as any,
      rawSnapshot: mockRawSnapshot as any,
    },
    update: {
      currency: "$",
      sumRevenue: mockSumRevenue as any,
      sumViews: mockSumViews as any,
      sumLikes: mockSumLikes as any,
      sumComments: mockSumComments as any,
      sumShares: mockSumShares as any,
      sumProfileViews: mockSumProfileViews as any,
      revenueBreakdown: mockRevenueBreakdown as any,
      dailyRevenueBreakdown: mockDailyRevenueBreakdown as any,
      rawSnapshot: mockRawSnapshot as any,
    },
  });

  console.log("[OK] AccountAnalytics updated successfully!");
  console.log("sumRevenue:", updated.sumRevenue);
  console.log("sumViews:", updated.sumViews);
  console.log("sumLikes:", updated.sumLikes);
  console.log("sumComments:", updated.sumComments);
  console.log("sumShares:", updated.sumShares);
  console.log("sumProfileViews:", updated.sumProfileViews);
  console.log("revenueBreakdown:", JSON.stringify(updated.revenueBreakdown, null, 2));
  console.log("dailyRevenueBreakdown points:", (updated.dailyRevenueBreakdown as any[])?.length);
  console.log("rawSnapshot (keyMetrics removed?):", !(updated.rawSnapshot as any)?.keyMetrics);
  console.log("rawSnapshot (revenueBreakdown removed?):", !(updated.rawSnapshot as any)?.revenueBreakdown);
  console.log("rawSnapshot (videosList count):", (updated.rawSnapshot as any)?.videosList?.length);
  console.log("rawSnapshot video 0 coverUrl:", (updated.rawSnapshot as any)?.videosList?.[0]?.coverUrl);

  // Check if SystemConfig contains anything for analytics_${username}
  const config = await prisma.systemConfig.findUnique({
    where: { key: `analytics_${account.username}` },
  });
  console.log("SystemConfig for analytics (should be none or not updated):", config ? "Exists" : "Not present");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
