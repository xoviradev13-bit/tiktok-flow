import "dotenv/config";
import { prisma } from "../src/lib/db";

async function main() {
  const names = ["ceotelamonix", "dat.nguyen6284"];
  for (const u of names) {
    const acc = await prisma.tiktokAccount.findFirst({
      where: { username: { equals: u, mode: "insensitive" } },
      select: {
        id: true,
        username: true,
        gpmProfileId: true,
        groupName: true,
        status: true,
        updatedAt: true,
        createdAt: true,
        assignedUserId: true,
      },
    });
    console.log("account", u, JSON.stringify(acc));
    if (!acc) continue;
    const logs = await prisma.accountLog.findMany({
      where: { accountId: acc.id },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { createdAt: true, message: true, actorName: true },
    });
    console.log("logs", u, JSON.stringify(logs, null, 2));
  }

  const wrong = await prisma.tiktokAccount.findMany({
    where: { gpmProfileId: "80d8f999-e7f6-4f06-bb33-15896a70b332" },
    select: { username: true, gpmProfileId: true },
  });
  console.log("wrong_id_accounts", wrong);

  const recent = await prisma.tiktokAccount.findMany({
    orderBy: { updatedAt: "desc" },
    take: 10,
    select: { username: true, gpmProfileId: true, updatedAt: true },
  });
  console.log("recent", recent);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
