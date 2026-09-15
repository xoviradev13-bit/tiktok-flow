import "dotenv/config";
import { prisma } from "../src/lib/db";

async function main() {
  const n = await prisma.tiktokAccount.count();
  const withGpm = await prisma.tiktokAccount.count({
    where: { gpmProfileId: { not: null } },
  });
  const recent = await prisma.tiktokAccount.findMany({
    orderBy: { createdAt: "desc" },
    take: 15,
    select: {
      username: true,
      gpmProfileId: true,
      createdAt: true,
      lastSyncedAt: true,
      status: true,
    },
  });
  const ceo = await prisma.tiktokAccount.findMany({
    where: {
      OR: [
        { username: { contains: "ceo", mode: "insensitive" } },
        { username: { contains: "telamon", mode: "insensitive" } },
      ],
    },
  });
  console.log(JSON.stringify({ n, withGpm, ceoCount: ceo.length, ceo, recent }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
