import { PrismaClient } from "../src/generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { finalizePendingChecklists, getBusinessToday } from "../src/lib/scoring-engine.ts";
import assert from "node:assert";

function createTestPrismaClient() {
  const connectionString = process.env.DATABASE_URL || process.env.DIRECT_URL || "";
  const pool = new Pool({
    connectionString,
    ssl: connectionString.includes("localhost") ? undefined : { rejectUnauthorized: false },
    max: 5,
  });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}

async function runTest() {
  console.log("=== Starting Resilient Catch-Up Cutoff Integration Test ===");

  // Initialize TWO separate PrismaClient instances with separate pools to test true DB concurrency
  const workerA = createTestPrismaClient();
  const workerB = createTestPrismaClient();

  const testUserId = `test_usr_${Date.now()}`;
  const createdChecklistIds = [];

  try {
    // 1. Create a dummy test user
    await workerA.user.create({
      data: {
        id: testUserId,
        email: `${testUserId}@example.com`,
        username: testUserId,
        role: "STAFF",
      },
    });
    console.log(`[TEST] Created mock user: ${testUserId}`);

    const { todayDateOnly } = getBusinessToday();
    const oneDayAgo = new Date(todayDateOnly.getTime() - 1 * 24 * 60 * 60 * 1000);
    const sixDaysAgo = new Date(todayDateOnly.getTime() - 6 * 24 * 60 * 60 * 1000);
    const fifteenDaysAgo = new Date(todayDateOnly.getTime() - 15 * 24 * 60 * 60 * 1000);

    // 2. Seed test checklists
    // Record A: Yesterday, isLocked: false -> MUST be caught up & locked
    const recA = await workerA.dailyChecklist.create({
      data: {
        userId: testUserId,
        date: oneDayAgo,
        isLocked: false,
        totalAssigned: 2,
        completedCount: 2,
      },
    });
    createdChecklistIds.push(recA.id);

    // Record B: 6 days ago, isLocked: false -> MUST be caught up & locked (inside 7d window)
    const recB = await workerA.dailyChecklist.create({
      data: {
        userId: testUserId,
        date: sixDaysAgo,
        isLocked: false,
        totalAssigned: 3,
        completedCount: 2,
      },
    });
    createdChecklistIds.push(recB.id);

    // Record C: 15 days ago, isLocked: false -> MUST REMAIN UNTOUCHED (outside 7d window)
    const recC = await workerA.dailyChecklist.create({
      data: {
        userId: testUserId,
        date: fifteenDaysAgo,
        isLocked: false,
        totalAssigned: 5,
        completedCount: 1,
      },
    });
    createdChecklistIds.push(recC.id);

    // Record D: Today, isLocked: false -> MUST REMAIN UNTOUCHED in catch-up mode (mid-day guard)
    const recD = await workerA.dailyChecklist.create({
      data: {
        userId: testUserId,
        date: todayDateOnly,
        isLocked: false,
        totalAssigned: 4,
        completedCount: 0,
      },
    });
    createdChecklistIds.push(recD.id);

    console.log(`[TEST] Seeded 4 test checklists. Firing concurrent workers...`);

    // 3. Fire CONCURRENT catch-up invocations across two distinct Prisma clients
    const [resWorkerA, resWorkerB] = await Promise.all([
      finalizePendingChecklists(workerA, { includeToday: false }),
      finalizePendingChecklists(workerB, { includeToday: false }),
    ]);

    const allFinalizedTestChecklists = [...resWorkerA.checklists, ...resWorkerB.checklists].filter((c) =>
      createdChecklistIds.includes(c.id)
    );

    console.log(`[TEST] Worker A processed: ${resWorkerA.processedCount} (Test items: ${resWorkerA.checklists.filter(c => createdChecklistIds.includes(c.id)).length})`);
    console.log(`[TEST] Worker B processed: ${resWorkerB.processedCount} (Test items: ${resWorkerB.checklists.filter(c => createdChecklistIds.includes(c.id)).length})`);
    console.log(`[TEST] Total test checklists processed across both workers: ${allFinalizedTestChecklists.length}`);

    // Assert optimistic locking prevented duplicate processing:
    // Across both workers, exactly 2 test checklists (Rec A and Rec B) must have been locked in total.
    assert.strictEqual(allFinalizedTestChecklists.length, 2, `Expected exactly 2 test checklists to be processed, got ${allFinalizedTestChecklists.length}`);

    // 4. Verify DB states
    const updatedA = await workerA.dailyChecklist.findUnique({ where: { id: recA.id } });
    const updatedB = await workerA.dailyChecklist.findUnique({ where: { id: recB.id } });
    const updatedC = await workerA.dailyChecklist.findUnique({ where: { id: recC.id } });
    const updatedD = await workerA.dailyChecklist.findUnique({ where: { id: recD.id } });

    assert.strictEqual(updatedA?.isLocked, true, "Record A (Yesterday) must be locked");
    assert.strictEqual(updatedB?.isLocked, true, "Record B (6 days ago) must be locked");
    assert.strictEqual(updatedC?.isLocked, false, "Record C (15 days ago) must remain unlocked (outside 7d window)");
    assert.strictEqual(updatedD?.isLocked, false, "Record D (Today) must remain unlocked (mid-day protection)");

    console.log("✅ All assertions passed successfully!");
    console.log("   - Record A (Yesterday): LOCKED as expected");
    console.log("   - Record B (6 days ago): LOCKED as expected");
    console.log("   - Record C (15 days ago): UNTOUCHED (safely ignored)");
    console.log("   - Record D (Today mid-day): UNTOUCHED (safely protected)");
    console.log("   - Concurrent workers: 0 race conditions, 0 duplicate processing");
  } finally {
    // 5. Safe, clean ID-specific teardown
    console.log(`[TEST] Cleaning up test artifacts...`);
    try {
      if (createdChecklistIds.length > 0) {
        await workerA.dailyChecklist.deleteMany({
          where: { id: { in: createdChecklistIds } },
        });
      }
      await workerA.user.deleteMany({
        where: { id: testUserId },
      });
      console.log(`[TEST] Cleanup completed.`);
    } catch (cleanErr) {
      console.warn(`[TEST] Cleanup error:`, cleanErr);
    } finally {
      await Promise.allSettled([workerA.$disconnect(), workerB.$disconnect()]);
    }
  }
}

runTest().catch((err) => {
  console.error("❌ Test failed with error:", err);
  process.exit(1);
});
