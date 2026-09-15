import "dotenv/config";
import { prisma } from "../src/lib/db";

async function main() {
  const accounts = await prisma.$queryRawUnsafe<{ c: number }[]>(
    'SELECT COUNT(*)::int AS c FROM "tiktok_accounts"'
  );
  const users = await prisma.$queryRawUnsafe<{ c: number }[]>(
    'SELECT COUNT(*)::int AS c FROM "User"'
  ).catch(() =>
    prisma.$queryRawUnsafe<{ c: number }[]>('SELECT COUNT(*)::int AS c FROM users')
  );
  console.log(JSON.stringify({ accounts, users }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
