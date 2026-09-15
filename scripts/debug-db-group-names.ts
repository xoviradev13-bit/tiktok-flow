import "dotenv/config";
import { prisma } from "../src/lib/db";

async function main() {
  const rows = await prisma.tiktokAccount.findMany({
    select: {
      username: true,
      gpmProfileId: true,
      gpmProfileName: true,
      groupName: true,
      isOnline: true,
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
