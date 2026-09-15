import "dotenv/config";
import { prisma as p } from "../src/lib/db";
const ids = [
  "32ace987-065a-4fb5-82bf-1cf195fa007c",
  "80d8f999-e7f6-4f06-bb33-15896a70b332",
  "b57d9f1b-4dae-4377-a870-99d5b8be8434",
  "5c7067f3-df4a-44f6-af28-41cd7425a89c",
  "4b36c020-e4d8-4ad4-90a6-125eefef965f",
];

async function main() {
  const accs = await p.tiktokAccount.findMany({
    where: { gpmProfileId: { in: ids } },
    select: {
      id: true,
      username: true,
      gpmProfileId: true,
      groupName: true,
      createdAt: true,
      updatedAt: true,
      lastSyncedAt: true,
    },
    orderBy: { updatedAt: "desc" },
  });
  console.log("accounts_by_gpm", JSON.stringify(accs, null, 2));

  const recent = await p.tiktokAccount.findMany({
    orderBy: { updatedAt: "desc" },
    take: 15,
    select: {
      username: true,
      gpmProfileId: true,
      groupName: true,
      updatedAt: true,
      createdAt: true,
    },
  });
  console.log("recent", JSON.stringify(recent, null, 2));

  for (const id of [
    "32ace987-065a-4fb5-82bf-1cf195fa007c",
    "80d8f999-e7f6-4f06-bb33-15896a70b332",
  ]) {
    const a = await p.tiktokAccount.findFirst({
      where: { gpmProfileId: id },
      select: { id: true, username: true },
    });
    if (!a) {
      console.log("no account for", id);
      continue;
    }
    const logs = await p.accountLog.findMany({
      where: { accountId: a.id },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        createdAt: true,
        message: true,
        actorName: true,
        logType: true,
      },
    });
    console.log("logs", a.username, id, JSON.stringify(logs, null, 2));
  }

  const linkLogs = await p.accountLog.findMany({
    where: {
      OR: [
        { message: { contains: "disk:" } },
        { message: { contains: "32ace987" } },
        { message: { contains: "80d8f999" } },
        { message: { contains: "gắn GPM" } },
        { message: { contains: "Gắn GPM" } },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { createdAt: true, message: true, actorName: true },
  });
  console.log("link_logs", JSON.stringify(linkLogs, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await p.$disconnect();
  });
