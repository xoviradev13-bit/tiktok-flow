import "dotenv/config";
import { prisma } from "../src/lib/db";

async function main() {
  const rows = await prisma.tiktokAccount.findMany({
    where: {
      OR: [
        { username: { contains: "hong" } },
        { username: { contains: "minh3808" } },
        { username: { contains: "ceotelamonix" } },
        { username: { contains: "dat.nguyen" } },
        { username: { contains: "user008437433" } },
      ],
    },
    select: {
      username: true,
      gpmProfileId: true,
      groupName: true,
      lastSyncedAt: true,
      status: true,
    },
    orderBy: { username: "asc" },
  });
  console.log(JSON.stringify(rows, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
