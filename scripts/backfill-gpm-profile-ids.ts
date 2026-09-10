/**
 * One-shot: attach missing gpmProfileId for accounts using local disk resolve.
 * Run: npx tsx scripts/backfill-gpm-profile-ids.ts
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { resolveGpmProfileByUsername } from "../src/lib/tiktok-extractor";

async function main() {
  const accounts = await prisma.tiktokAccount.findMany({
    where: { gpmProfileId: null },
    select: { id: true, username: true, groupName: true },
  });

  console.log(`Found ${accounts.length} accounts without GPM Profile ID`);
  let linked = 0;

  for (const acc of accounts) {
    const match = resolveGpmProfileByUsername(acc.username);
    if (!match) {
      console.log(`  skip @${acc.username} (no unique disk match)`);
      continue;
    }

    const conflict = await prisma.tiktokAccount.findFirst({
      where: {
        gpmProfileId: match.id,
        NOT: { id: acc.id },
      },
      select: { username: true },
    });
    if (conflict) {
      console.log(
        `  skip @${acc.username} — GPM ${match.id} already on @${conflict.username}`
      );
      continue;
    }

    await prisma.tiktokAccount.update({
      where: { id: acc.id },
      data: { gpmProfileId: match.id },
    });
    await prisma.accountLog.create({
      data: {
        accountId: acc.id,
        newStatus: "ACTIVE",
        logType: "STATUS_CHANGE",
        message: `Backfill: gắn GPM Profile ${match.id} cho @${acc.username} (disk resolve).`,
        actorName: "System Backfill",
      },
    });
    linked++;
    console.log(`  linked @${acc.username} → ${match.id}`);
  }

  console.log(`Done. Linked ${linked}/${accounts.length}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
