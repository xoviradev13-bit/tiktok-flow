// Test: create a SyncJob and watch if agent picks it up within 30s
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const USER_ID = "cmts93y3t0000fssuw5gyqsar";

async function main() {
  const job = await prisma.syncQueue.create({
    data: {
      requestedById: USER_ID,
      targetScope: USER_ID,
      status: "PENDING",
    },
  });
  console.log(`[+] Created job: ${job.id} at ${job.requestedAt.toISOString()}`);

  for (let i = 0; i < 7; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const check = await prisma.syncQueue.findUnique({
      where: { id: job.id },
      select: { id: true, status: true, startedAt: true, machineName: true },
    });
    console.log(`Poll ${i + 1}/7 (${new Date().toISOString()}):`, JSON.stringify(check));
    if (check?.status !== "PENDING") {
      console.log(`[!] STATUS CHANGED TO: ${check?.status}`);
      break;
    }
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
