import "dotenv/config";
import { prisma } from "../src/lib/prisma.ts";

const placeholders = await prisma.tiktokAccount.findMany({
  where: {
    OR: [
      { username: { startsWith: "profile_" } },
      { gpmProfileName: { equals: "Profile 5404" } },
      { gpmProfileName: { contains: "5404" } },
    ],
  },
  select: {
    username: true,
    gpmProfileId: true,
    gpmProfileName: true,
    groupName: true,
    lastSyncedAt: true,
  },
  take: 50,
});
console.log(JSON.stringify(placeholders, null, 2));

const test1 = await prisma.tiktokAccount.findMany({
  where: { groupName: { equals: "test 1", mode: "insensitive" } },
  select: {
    username: true,
    gpmProfileId: true,
    gpmProfileName: true,
    lastSyncedAt: true,
  },
});
console.log("\ntest 1 group:", JSON.stringify(test1, null, 2));

await prisma.$disconnect();
