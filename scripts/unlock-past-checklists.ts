import "dotenv/config";
import { prisma } from "../src/lib/prisma";

async function main() {
  const result = await prisma.dailyChecklist.updateMany({
    where: {
      userId: "cmts93y3t0000fssuw5gyqsar",
      date: {
        gte: new Date(Date.UTC(2026, 8, 17)),
        lte: new Date(Date.UTC(2026, 8, 22)),
      },
    },
    data: {
      isLocked: false,
      lockedAt: null,
    },
  });

  console.log(`Unlocked ${result.count} past checklists.`);
}

main().catch(console.error).finally(() => process.exit(0));
