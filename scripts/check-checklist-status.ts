import "dotenv/config";
import { prisma } from "../src/lib/prisma";

async function main() {
  const checklists = await prisma.dailyChecklist.findMany({
    where: { userId: "cmts93y3t0000fssuw5gyqsar" },
    orderBy: { date: "desc" },
    take: 8,
    select: {
      id: true,
      date: true,
      isLocked: true,
      completedCount: true,
      totalAssigned: true,
      workdayScore: true,
    },
  });
  console.table(
    checklists.map((c) => ({
      ...c,
      date: c.date.toISOString().split("T")[0],
    }))
  );
}

main().catch(console.error).finally(() => process.exit(0));
