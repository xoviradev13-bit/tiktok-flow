import "dotenv/config";
import { prisma } from "../src/lib/prisma.ts";

const hong = await prisma.tiktokAccount.findFirst({
  where: { username: "hong.minh3808" },
});
const logs = await prisma.accountLog.findMany({
  where: { accountId: hong.id },
  orderBy: { createdAt: "desc" },
  take: 15,
});
console.log(
  "logs",
  logs.map((l) => ({
    at: l.createdAt,
    type: l.logType,
    msg: String(l.message || "").slice(0, 200),
  }))
);

// Any account whose gpmProfileName looks like Profile 5404 with an ID?
const named = await prisma.tiktokAccount.findMany({
  where: { gpmProfileName: { contains: "5404" } },
  select: { username: true, gpmProfileId: true, gpmProfileName: true },
});
console.log("named 5404", named);

// UUID prefix search - Profile 5404 might mean GPM numeric name
const withId = await prisma.tiktokAccount.findMany({
  where: { gpmProfileId: { not: null }, groupName: "test 1" },
  select: { username: true, gpmProfileId: true, gpmProfileName: true, groupName: true },
  take: 40,
});
console.log("group test 1 with id", withId);

await prisma.$disconnect();
