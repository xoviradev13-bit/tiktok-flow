import "dotenv/config";
import { prisma } from "../src/lib/db";

async function main() {
  const n = await prisma.tiktokAccount.count();
  const sample = await prisma.tiktokAccount.findMany({
    take: 8,
    orderBy: { updatedAt: "desc" },
    select: { username: true, gpmProfileId: true, updatedAt: true },
  });
  const host = (process.env.DATABASE_URL || "")
    .replace(/:[^:@/]+@/, "://***@")
    .slice(0, 90);
  console.log(JSON.stringify({ count: n, host, sample }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
