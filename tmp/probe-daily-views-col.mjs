import "dotenv/config";
import { prisma } from "../src/lib/prisma.ts";

const cols = await prisma.$queryRawUnsafe(
  `SELECT column_name FROM information_schema.columns WHERE table_name = 'account_analytics' ORDER BY 1`
);
console.log(
  "columns:",
  cols.map((c) => c.column_name).join(", ")
);
console.log(
  "has dailyViewsBreakdown:",
  cols.some((c) => c.column_name === "dailyViewsBreakdown")
);

// Probe whether the live PrismaClient accepts the field.
const probeId = "sync-flow-probe-nonexistent";
try {
  await prisma.accountAnalytics.update({
    where: { accountId: probeId },
    data: { dailyViewsBreakdown: [{ date: "2026-01-01", views: 1 }] },
  });
} catch (e) {
  const msg = String(e?.message || e);
  if (msg.includes("Unknown argument `dailyViewsBreakdown`")) {
    console.log("CLIENT_REJECTS_dailyViewsBreakdown");
  } else if (msg.includes("Record to update not found") || e?.code === "P2025") {
    console.log("CLIENT_ACCEPTS_dailyViewsBreakdown");
  } else {
    console.log("PROBE_OTHER:", msg.slice(0, 300));
  }
}

await prisma.$disconnect();
