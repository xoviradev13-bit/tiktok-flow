import "dotenv/config";
import { prisma } from "../src/lib/db";

const USER = "dat.nguyen6284";
const CORRECT = "4b36c020-e4d8-4ad4-90a6-125eefef965f";
const WRONG = "80d8f999-e7f6-4f06-bb33-15896a70b332";

async function main() {
  const acc = await prisma.tiktokAccount.findFirst({
    where: { username: USER },
  });
  if (!acc) {
    console.log("account not found");
    return;
  }
  const conflict = await prisma.tiktokAccount.findFirst({
    where: { gpmProfileId: CORRECT, NOT: { id: acc.id } },
    select: { username: true },
  });
  if (conflict) {
    console.log("conflict with", conflict.username);
    return;
  }
  await prisma.tiktokAccount.update({
    where: { id: acc.id },
    data: { gpmProfileId: CORRECT, groupName: "Profile 3708" },
  });
  await prisma.accountLog.create({
    data: {
      accountId: acc.id,
      newStatus: acc.status,
      logType: "STATUS_CHANGE",
      message: `Sửa GPM ID sai ${WRONG} → ${CORRECT} (Copy ID GPM / Profile 3708). Stale disk sync.`,
      actorName: "Debug Fix",
    },
  });
  console.log(`fixed @${USER} → ${CORRECT}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
