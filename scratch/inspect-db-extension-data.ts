import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL || "";

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function inspectOusnowfan() {
  const account = await prisma.tiktokAccount.findFirst({
    where: {
      OR: [
        { username: "ousnowfan" },
        { gpmProfileId: "500a1071-8dd2-43dd-9685-220721b0c4a4" }
      ]
    },
    include: {
      logs: {
        orderBy: { createdAt: "desc" },
        take: 3,
      },
      analytics: {
        select: {
          sumViews: true,
          sumLikes: true,
          sumRevenue: true,
          sumComments: true,
          sumShares: true,
          sumProfileViews: true,
          revenueBreakdown: true,
          updatedAt: true,
        }
      }
    }
  });

  const summary = {
    id: account?.id,
    username: account?.username,
    country: account?.country,
    gpmProfileId: account?.gpmProfileId,
    gpmProfileName: account?.gpmProfileName,
    groupName: account?.groupName,
    status: account?.status,
    isOnline: account?.isOnline,
    totalFollowers: account?.totalFollowers,
    totalViews: account?.totalViews?.toString(),
    totalVideos: account?.totalVideos,
    totalRevenue: account?.totalRevenue?.toString(),
    lastSyncedAt: account?.lastSyncedAt,
    updatedAt: account?.updatedAt,
    analytics: account?.analytics,
    recentLogs: account?.logs,
  };

  console.log("=== EXACT DATA EXTENSION / SYSTEM HAS IN DB ===");
  console.log(JSON.stringify(summary, null, 2));

  await prisma.$disconnect();
  await pool.end();
  process.exit(0);
}

inspectOusnowfan().catch((e) => {
  console.error("DB Error:", e);
  process.exit(1);
});
