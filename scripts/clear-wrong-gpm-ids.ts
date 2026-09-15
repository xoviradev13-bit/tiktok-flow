import "dotenv/config";
import { prisma } from "../src/lib/db";

/** Stale on-disk profile folders that are NOT in the live GPM API list. */
const WRONG_IDS = [
  "32ace987-065a-4fb5-82bf-1cf195fa007c",
  "80d8f999-e7f6-4f06-bb33-15896a70b332",
];

async function main() {
  const before = await prisma.tiktokAccount.findMany({
    where: { gpmProfileId: { in: WRONG_IDS } },
    select: { id: true, username: true, gpmProfileId: true },
  });
  console.log("before", JSON.stringify(before, null, 2));

  for (const acc of before) {
    await prisma.tiktokAccount.update({
      where: { id: acc.id },
      data: { gpmProfileId: null },
    });
    await prisma.accountLog.create({
      data: {
        accountId: acc.id,
        newStatus: "ACTIVE",
        logType: "STATUS_CHANGE",
        message: `Gỡ GPM Profile ${acc.gpmProfileId} sai (folder cũ trên disk, không còn trong GPM API). Sẽ gắn lại qua session-bind.`,
        actorName: "Debug Fix",
      },
    });
    console.log(`cleared @${acc.username} was ${acc.gpmProfileId}`);
  }

  const after = await prisma.tiktokAccount.findMany({
    where: { gpmProfileId: { in: WRONG_IDS } },
    select: { username: true, gpmProfileId: true },
  });
  console.log("after_wrong_remaining", after.length);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
