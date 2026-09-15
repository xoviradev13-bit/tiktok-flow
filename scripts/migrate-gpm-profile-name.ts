import "dotenv/config";
import { prisma } from "../src/lib/db";
import { looksLikeGpmProfileName } from "../src/lib/gpm-profile-fields";

/**
 * Move legacy profile labels out of groupName into gpmProfileName.
 * Leaves real group names (e.g. "Default group") untouched.
 */
async function main() {
  const rows = await prisma.tiktokAccount.findMany({
    where: { groupName: { not: null } },
    select: { id: true, username: true, groupName: true, gpmProfileName: true },
  });

  let moved = 0;
  let clearedFleet = 0;
  for (const row of rows) {
    const gn = row.groupName || "";
    if (looksLikeGpmProfileName(gn)) {
      await prisma.tiktokAccount.update({
        where: { id: row.id },
        data: {
          gpmProfileName: row.gpmProfileName || gn,
          groupName: null,
        },
      });
      moved++;
      console.log(`moved @${row.username}: "${gn}" → gpmProfileName`);
      continue;
    }
    if (/^(Extension Fleet|GPM Fleet|GPMLogin Fleet)$/i.test(gn)) {
      await prisma.tiktokAccount.update({
        where: { id: row.id },
        data: { groupName: null },
      });
      clearedFleet++;
      console.log(`cleared placeholder @${row.username}: "${gn}"`);
    }
  }

  console.log(JSON.stringify({ total: rows.length, moved, clearedFleet }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
