import "dotenv/config";
import { prisma } from "../src/lib/prisma";

async function main() {
  const latestJobs = await prisma.syncQueue.findMany({
    take: 10,
    orderBy: { requestedAt: "desc" },
  });
  console.log("=== LATEST 10 SYNCQUEUE JOBS ===");
  for (const job of latestJobs) {
    console.log(JSON.stringify({
      id: job.id,
      status: job.status,
      requestedAt: job.requestedAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      errorMessage: job.errorMessage,
      resultSummary: job.resultSummary,
      requestedById: job.requestedById,
      machineName: job.machineName,
    }, null, 2));
  }
}

main().catch(console.error).finally(() => process.exit(0));
