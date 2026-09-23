import "dotenv/config";
import { prisma } from "../src/lib/prisma";

async function main() {
  const userId = "cmts93y3t0000fssuw5gyqsar";

  const analytics = await prisma.accountAnalytics.findMany({
    where: {
      account: { assignedUserId: userId },
    },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: {
      account: { select: { username: true } },
      createdAt: true,
      rawSnapshot: true,
      postRewards: true,
    },
  });

  console.log("Found analytics count:", analytics.length);
  for (const a of analytics) {
    console.log(`\nAccount: @${a.account.username} at ${a.createdAt.toISOString()}`);
    const raw = a.rawSnapshot as any;
    const vList = raw?.videosList || [];
    console.log(`Videos in rawSnapshot.videosList: ${vList.length}`);
    if (vList.length > 0) {
      console.log("First 3 videos in list:");
      for (const v of vList.slice(0, 3)) {
        console.log(` - ID: ${v.id}, createTime: ${v.createTime || v.create_time}, title: ${v.title || v.desc || "no title"}`);
      }
    }
    const rewards = a.postRewards as any[];
    console.log(`postRewards count: ${rewards?.length || 0}`);
  }

  await prisma.$disconnect();
}

main().catch(console.error);
