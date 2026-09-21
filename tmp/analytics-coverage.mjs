import "dotenv/config";
import { prisma } from "../src/lib/prisma.ts";

const rows = await prisma.tiktokAccount.findMany({
  select: {
    username: true,
    gpmProfileId: true,
    lastSyncedAt: true,
    totalVideos: true,
    totalRevenue: true,
    analytics: {
      select: {
        updatedAt: true,
        id: true,
        postRewards: true,
        sumViews: true,
        sumRevenue: true,
        dailyViewsBreakdown: true,
        rawSnapshot: true,
      },
    },
  },
  orderBy: { lastSyncedAt: "desc" },
  take: 40,
});

const withA = rows.filter((r) => r.analytics);
const withoutA = rows.filter((r) => !r.analytics);
console.log(
  JSON.stringify(
    {
      total: rows.length,
      withAnalytics: withA.length,
      withoutAnalytics: withoutA.length,
      withoutUsernames: withoutA.map((a) => a.username),
      rows: rows.map((a) => {
        const snap = a.analytics?.rawSnapshot || {};
        return {
          username: a.username,
          gpm: a.gpmProfileId?.slice(0, 8) || null,
          lastSyncedAt: a.lastSyncedAt,
          analyticsUpdatedAt: a.analytics?.updatedAt || null,
          hasAnalytics: !!a.analytics,
          postRewards: Array.isArray(a.analytics?.postRewards)
            ? a.analytics.postRewards.length
            : null,
          videosList: Array.isArray(snap.videosList) ? snap.videosList.length : null,
          dailyViews: Array.isArray(a.analytics?.dailyViewsBreakdown)
            ? a.analytics.dailyViewsBreakdown.length
            : null,
          hasSumViews: !!a.analytics?.sumViews,
          hasSumRevenue: !!a.analytics?.sumRevenue,
          totalVideos: a.totalVideos,
          totalRevenue: a.totalRevenue,
        };
      }),
    },
    null,
    2
  )
);

await prisma.$disconnect();
