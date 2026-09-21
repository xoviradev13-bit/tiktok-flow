import "dotenv/config";
import { prisma } from "../src/lib/prisma.ts";

const handles = ["hong.minh3808", "ousnowfan"];

for (const username of handles) {
  const acc = await prisma.tiktokAccount.findFirst({
    where: { username: { equals: username, mode: "insensitive" } },
    include: { analytics: true },
  });
  if (!acc) {
    console.log("\n===", username, "NO_ACCOUNT ===");
    continue;
  }
  const a = acc.analytics;
  const snap = (a?.rawSnapshot || {});
  const pr = Array.isArray(a?.postRewards) ? a.postRewards : [];
  const now = Date.now();
  const parseTs = (p) => {
    if (p.publishTimeUnix) {
      const n = Number(p.publishTimeUnix);
      return n > 1e11 ? n : n * 1000;
    }
    const t = new Date(p.publishDate || p.postDate || "").getTime();
    return Number.isFinite(t) ? t : 0;
  };
  const within60 = pr.filter((p) => {
    const ts = parseTs(p);
    return ts <= 0 || now - ts <= 60 * 86400000;
  });
  const within365 = pr.filter((p) => {
    const ts = parseTs(p);
    return ts <= 0 || now - ts <= 365 * 86400000;
  });

  console.log(
    JSON.stringify(
      {
        username: acc.username,
        id: acc.id,
        gpmProfileId: acc.gpmProfileId,
        gpmProfileName: acc.gpmProfileName,
        groupName: acc.groupName,
        status: acc.status,
        totalVideos: acc.totalVideos,
        totalViews: String(acc.totalViews),
        totalRevenue: acc.totalRevenue,
        lastSyncedAt: acc.lastSyncedAt,
        analyticsUpdatedAt: a?.updatedAt,
        markers: {
          insightsStatus: snap.insightsStatus,
          insightsNeedsRepair: snap.insightsNeedsRepair,
          insightsConfirmed: snap.insightsConfirmed,
          rewardsStatus: snap.rewardsStatus,
          rewardsConfirmed: snap.rewardsConfirmed,
          postRewardsPartial: snap.postRewardsPartial,
        },
        sumViews: a?.sumViews ?? null,
        sumRevenue: a?.sumRevenue ?? null,
        postRewardsLen: pr.length,
        postRewardsWithin60: within60.length,
        postRewardsWithin365: within365.length,
        videosListInSnap: Array.isArray(snap.videosList) ? snap.videosList.length : null,
        dailyViewsBreakdownLen: Array.isArray(a?.dailyViewsBreakdown)
          ? a.dailyViewsBreakdown.length
          : null,
      },
      null,
      2
    )
  );
}

const fuzzy = await prisma.tiktokAccount.findMany({
  where: {
    OR: [
      { username: { contains: "hong", mode: "insensitive" } },
      { username: { contains: "minh3808", mode: "insensitive" } },
      { gpmProfileName: { contains: "hong", mode: "insensitive" } },
      { gpmProfileName: { contains: "minh", mode: "insensitive" } },
    ],
  },
  select: {
    username: true,
    gpmProfileId: true,
    gpmProfileName: true,
    groupName: true,
    lastSyncedAt: true,
    totalVideos: true,
  },
  take: 30,
});
console.log("\n=== fuzzy matches ===");
console.log(JSON.stringify(fuzzy, null, 2));

// Any GPM profile id that looks unused / orphaned with similar name in sessions?
await prisma.$disconnect();
