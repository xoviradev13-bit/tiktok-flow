import { prisma } from "../src/lib/prisma";

async function main() {
  const account = await prisma.tiktokAccount.findFirst({
    where: { username: { contains: "ousnowfan", mode: "insensitive" } },
    include: { analytics: true },
  });

  if (!account) {
    console.log("Account ousnowfan not found in database!");
    process.exit(0);
  }

  console.log(`Account: @${account.username}`);
  console.log(`ID: ${account.id}`);
  console.log(`GPM Profile ID: ${account.gpmProfileId}`);
  console.log(`Country: ${account.country}`);
  console.log(`Status: ${account.status}`);
  console.log(`Banned Reason: ${account.bannedReason}`);
  console.log(`Total Rewards USD: ${account.analytics?.totalRewardsUsd}`);
  console.log(`RPM: ${account.analytics?.rpm}`);
  console.log("\n--- Full postRewards Data ---");
  console.log(JSON.stringify(account.analytics?.postRewards, null, 2));

  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
