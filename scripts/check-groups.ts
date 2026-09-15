import dotenv from "dotenv";
dotenv.config();

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const accounts = await prisma.tiktokAccount.findMany({
    select: {
      username: true,
      gpmProfileId: true,
      gpmProfileName: true,
      groupName: true,
    },
    orderBy: { updatedAt: "desc" },
    take: 10,
  });
  console.log("Found accounts:", JSON.stringify(accounts, null, 2));
  await prisma.$disconnect();
}

main().catch(console.error);
