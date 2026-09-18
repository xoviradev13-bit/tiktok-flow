import "dotenv/config";
import { prisma } from "../src/lib/prisma.js";

async function main() {
  const queues = await prisma.syncQueue.findMany({
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  console.log(`=== SYNC QUEUES (${queues.length}) ===`);
  for (const q of queues) {
    console.log(`\nQueue ID: ${q.id} | Status: ${q.status}`);
    console.log(`  Profiles: ${q.profilesCount} | Success: ${q.successCount} | Fail: ${q.failCount}`);
    console.log(`  RequestedAt: ${q.requestedAt?.toISOString()} | CompletedAt: ${q.completedAt?.toISOString()}`);
    console.log(`  ResultSummary: ${q.resultSummary}`);
    console.log(`  ErrorMessage: ${q.errorMessage}`);
  }
}

main().catch(console.error).finally(() => process.exit(0));
