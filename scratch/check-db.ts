import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL || "";
console.log("Connecting to:", connectionString.replace(/:[^:@]+@/, ":***@"));

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function checkDb() {
  const accounts = await prisma.tiktokAccount.findMany({
    include: {
      analytics: true,
    },
    orderBy: { updatedAt: "desc" },
  });

  console.log("=== TOTAL ACCOUNTS IN DATABASE ===", accounts.length);
  for (const a of accounts) {
    console.log(`- @${a.username} (${a.gpmProfileName || "N/A"}) | GPM: ${a.gpmProfileId || "N/A"} | Group: ${a.groupName || "N/A"} | Followers: ${a.totalFollowers} | Views: ${a.totalViews} | Videos: ${a.totalVideos} | Rev: $${a.totalRevenue} | Country: ${a.country} | LastSync: ${a.lastSyncedAt}`);
    if (a.analytics) {
      console.log(`   [Analytics] Likes: ${(a.analytics.sumLikes as any)?.totalLikes} | RPM: ${(a.metadata as any)?.rpm || "N/A"}`);
    }
  }

  await prisma.$disconnect();
  await pool.end();
  process.exit(0);
}

checkDb().catch((e) => {
  console.error("DB Error:", e.message || e);
  process.exit(1);
});
