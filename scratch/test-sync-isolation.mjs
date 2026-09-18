import { PrismaClient } from "../src/generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import dotenv from "dotenv";

dotenv.config();

const connectionString = process.env.DATABASE_URL || process.env.DIRECT_URL || "";
const pool = new Pool({
  connectionString,
  ssl: connectionString.includes("localhost") ? undefined : { rejectUnauthorized: false },
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function run() {
  console.log("--- Testing Multi-User Sync Isolation ---");
  
  // Find two users in DB
  const users = await prisma.user.findMany({ take: 2, select: { id: true, name: true, role: true } });
  if (users.length < 2) {
    console.log("Need at least 2 users to test multi-user isolation. Found:", users.length);
    return;
  }
  const userA = users[0];
  const userB = users[1];
  console.log(`User A: ${userA.name} (${userA.id}, ${userA.role})`);
  console.log(`User B: ${userB.name} (${userB.id}, ${userB.role})`);

  // 1. Create a job for User A
  const jobA = await prisma.syncQueue.create({
    data: {
      requestedById: userA.id,
      status: "PENDING",
      targetScope: `USER:${userA.id}`,
      requestedAt: new Date(),
    }
  });
  console.log(`[+] Created test job for User A: ${jobA.id}`);

  try {
    // 2. Query as User B would query in getActiveSyncJobForUser / userScopeFilter
    const userBScopeFilter = {
      OR: [
        { requestedById: userB.id },
        { targetScope: `USER:${userB.id}` },
        { targetScope: userB.id },
        { targetScope: { startsWith: `USER:${userB.id}|` } },
      ],
    };

    const userBActiveJob = await prisma.syncQueue.findFirst({
      where: {
        ...userBScopeFilter,
        status: { in: ["PENDING", "PROCESSING"] },
      },
    });

    console.log(`[*] User B sees active job: ${userBActiveJob ? userBActiveJob.id : "NONE (CORRECT!)"}`);
    if (userBActiveJob) {
      console.error("FAIL: User B should not see User A's active job!");
      process.exit(1);
    }

    // 3. Simulate User B calling "stop" (without jobId)
    const userBOwnershipFilter = [
      { requestedById: userB.id },
      { targetScope: `USER:${userB.id}` },
      { targetScope: userB.id },
      { targetScope: { startsWith: `USER:${userB.id}|` } },
    ];
    const stoppedByUserB = await prisma.syncQueue.updateMany({
      where: {
        status: { in: ["PENDING", "PROCESSING"] },
        OR: userBOwnershipFilter,
      },
      data: {
        status: "CANCELLED",
        completedAt: new Date(),
        errorMessage: `Dừng bởi ${userB.name}`,
      }
    });
    console.log(`[*] User B stopped ${stoppedByUserB.count} jobs.`);

    // 4. Verify User A's job was NOT cancelled
    const checkJobA = await prisma.syncQueue.findUnique({ where: { id: jobA.id } });
    console.log(`[*] User A's job status after User B stop: ${checkJobA.status} (EXPECTED: PENDING)`);
    if (checkJobA.status !== "PENDING") {
      console.error("FAIL: User A's job was cancelled by User B!");
      process.exit(1);
    }

    // 5. User A cancels their own job
    const userAOwnershipFilter = [
      { requestedById: userA.id },
      { targetScope: `USER:${userA.id}` },
      { targetScope: userA.id },
      { targetScope: { startsWith: `USER:${userA.id}|` } },
    ];
    await prisma.syncQueue.updateMany({
      where: {
        id: jobA.id,
        OR: userAOwnershipFilter,
      },
      data: {
        status: "CANCELLED",
        completedAt: new Date(),
        errorMessage: `Dừng bởi ${userA.name}`,
      }
    });
    console.log(`[*] User A cancelled their own job.`);

    // 6. Check client-sync query for User B: Should NOT return cancelledJobId from User A
    const userBCancelledJobs = await prisma.syncQueue.findMany({
      where: {
        status: "CANCELLED",
        updatedAt: { gte: new Date(Date.now() - 5 * 60 * 1000) },
        ...userBScopeFilter,
      },
      select: { id: true },
    });
    console.log(`[*] User B cancelled jobs visible: ${userBCancelledJobs.length} (EXPECTED: 0)`);
    if (userBCancelledJobs.length !== 0) {
      console.error("FAIL: User B should not see User A's cancelled job!");
      process.exit(1);
    }

    // 7. Check client-sync query for User A: SHOULD return jobA
    const userACancelledJobs = await prisma.syncQueue.findMany({
      where: {
        status: "CANCELLED",
        updatedAt: { gte: new Date(Date.now() - 5 * 60 * 1000) },
        OR: userAOwnershipFilter,
      },
      select: { id: true },
    });
    console.log(`[*] User A cancelled jobs visible: ${userACancelledJobs.length} (EXPECTED: >= 1)`);
    if (userACancelledJobs.length === 0) {
      console.error("FAIL: User A should see their own cancelled job!");
      process.exit(1);
    }

    console.log("\n>>> ALL MULTI-USER ISOLATION TESTS PASSED PERFECTLY! <<<");

  } finally {
    // Clean up test job
    await prisma.syncQueue.deleteMany({ where: { id: jobA.id } });
    await pool.end();
  }
}

run().catch(console.error);
