import { PrismaClient } from "../src/generated/prisma/index.js";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL || process.env.DIRECT_URL || "";
const pool = new Pool({
  connectionString,
  ssl: connectionString.includes("localhost") ? undefined : { rejectUnauthorized: false },
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function checkDb() {
  const accounts = await prisma.tiktokAccount.findMany({
    select: {
      id: true,
      username: true,
      nickname: true,
      gpmProfileId: true,
      groupName: true,
      status: true,
      followersCount: true,
      totalLikes: true,
      totalViews: true,
      totalRevenue: true,
      country: true,
      rpm: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: "desc" },
  });

  console.log("=== TOTAL ACCOUNTS IN DATABASE ===", accounts.length);
  for (const a of accounts) {
    console.log(`- @${a.username || "N/A"} (${a.nickname || "N/A"}) | GPM ID: ${a.gpmProfileId || "N/A"} | Group: ${a.groupName || "N/A"} | Followers: ${a.followersCount} | Likes: ${a.totalLikes} | Views: ${a.totalViews} | Rev: $${a.totalRevenue} | Country: ${a.country}`);
  }

  // Also check AccountAnalytics for ousnowfan
  const ousnowfan = accounts.find(a => a.username === "ousnowfan" || a.gpmProfileId === "500a1071-8dd2-43dd-9685-220721b0c4a4");
  if (ousnowfan) {
    const analytics = await prisma.accountAnalytics.findUnique({
      where: { accountId: ousnowfan.id },
    });
    console.log("\n=== OUSNOWFAN ANALYTICS IN DB ===");
    console.log("Analytics record found:", !!analytics);
    if (analytics) {
      console.log("sumViews:", analytics.sumViews);
      console.log("sumLikes:", analytics.sumLikes);
      console.log("sumRevenue:", analytics.sumRevenue);
      console.log("revenueBreakdown:", analytics.revenueBreakdown);
    }
  }

  await prisma.$disconnect();
  await pool.end();
}

checkDb().catch(console.error);
