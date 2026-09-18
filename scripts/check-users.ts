import "dotenv/config";
import { prisma } from "../src/lib/prisma";

async function main() {
  const users = await prisma.user.findMany({
    select: { id: true, email: true, role: true, extensionToken: true, name: true, username: true },
  });
  console.log("Users in database:", JSON.stringify(users, null, 2));
}

main().catch(console.error).finally(() => process.exit(0));
