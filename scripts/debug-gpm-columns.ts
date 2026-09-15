import "dotenv/config";
import { prisma } from "../src/lib/db";

async function main() {
  const cols = await prisma.$queryRawUnsafe<
    { column_name: string }[]
  >(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = 'tiktok_accounts'
       AND (column_name ILIKE '%gpm%' OR column_name ILIKE '%group%')
     ORDER BY column_name`
  );
  console.log(JSON.stringify(cols, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
