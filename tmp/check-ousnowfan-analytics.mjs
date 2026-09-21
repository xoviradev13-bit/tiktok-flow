import { PrismaClient } from "../src/generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import "dotenv/config";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || process.env.DIRECT_URL,
  ssl: (process.env.DATABASE_URL || "").includes("localhost")
    ? undefined
    : { rejectUnauthorized: false },
  max: 2,
});
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const acc = await prisma.tiktokAccount.findFirst({
  where: { username: "ousnowfan" },
  include: { analytics: true },
});

if (!acc) {
  console.log("NO_ACCOUNT");
  process.exit(0);
}

const a = acc.analytics;
console.log(
  JSON.stringify(
    {
      id: acc.id,
      username: acc.username,
      totalViews: String(acc.totalViews),
      totalRevenue: acc.totalRevenue,
      totalFollowers: acc.totalFollowers,
      totalVideos: acc.totalVideos,
      lastSyncedAt: acc.lastSyncedAt,
      hasAnalytics: !!a,
      analyticsUpdatedAt: a?.updatedAt,
      sumViews: a?.sumViews ?? null,
      sumLikes: a?.sumLikes ?? null,
      sumComments: a?.sumComments ?? null,
      sumShares: a?.sumShares ?? null,
      sumProfileViews: a?.sumProfileViews ?? null,
      sumRevenue: a?.sumRevenue ?? null,
      postRewardsLen: Array.isArray(a?.postRewards) ? a.postRewards.length : null,
      rawSnapshot: a?.rawSnapshot
        ? {
            insightsUnavailable: a.rawSnapshot.insightsUnavailable,
            updatedAt: a.rawSnapshot.updatedAt,
            videos: Array.isArray(a.rawSnapshot.videosList)
              ? a.rawSnapshot.videosList.length
              : null,
          }
        : null,
    },
    null,
    2
  )
);

await prisma.$disconnect();
await pool.end();
