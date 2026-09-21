/**
 * Directly upsert AccountAnalytics from an extract dump (bypasses HTTP)
 * to surface Prisma/schema errors without auth/timeout noise.
 */
import "dotenv/config";
import fs from "fs";
import { prisma } from "../src/lib/prisma.ts";

const dumpPath =
  process.argv[2] ||
  "client-agent/test-results/run-2026-09-20T21-48-41-337Z/profiles/ousnowfan__500a1071.full.json";
const username = (process.argv[3] || "").replace(/^@/, "") || null;

const raw = JSON.parse(fs.readFileSync(dumpPath, "utf8"));
const d = raw.data || raw;
const handle = (username || d.username || "").replace(/^@/, "").toLowerCase();

const acc = await prisma.tiktokAccount.findFirst({
  where: { username: { equals: handle, mode: "insensitive" } },
  select: { id: true, username: true, analytics: { select: { id: true } } },
});
if (!acc) {
  console.error("NO ACCOUNT", handle);
  process.exit(1);
}
console.log("account", acc.username, acc.id, "hasAnalytics", !!acc.analytics);

const videosList = Array.isArray(d.videosList) ? d.videosList.slice(0, 20) : [];
const postRewards = Array.isArray(d.postRewards) ? d.postRewards : [];
const payload = {
  currency: d.currency || "$",
  sumRevenue: d.sumRevenue ?? undefined,
  sumViews: d.sumViews ?? undefined,
  sumLikes: d.sumLikes ?? undefined,
  sumComments: d.sumComments ?? undefined,
  sumShares: d.sumShares ?? undefined,
  sumProfileViews: d.sumProfileViews ?? undefined,
  revenueBreakdown: d.revenueBreakdown ?? undefined,
  dailyRevenueBreakdown: d.dailyRevenueBreakdown ?? undefined,
  dailyViewsBreakdown: d.dailyViewsBreakdown ?? undefined,
  insightsHistory: d.insightsHistory ?? undefined,
  postRewards,
  rawSnapshot: {
    username: handle,
    updatedAt: new Date().toISOString(),
    videosList,
    topVideos365d: d.topVideos365d || null,
    source: "direct-upsert-test",
  },
};

console.log("payload field sizes:");
for (const [k, v] of Object.entries(payload)) {
  if (v == null) continue;
  console.log(" ", k, Array.isArray(v) ? `arr(${v.length})` : typeof v, JSON.stringify(v).length);
}

try {
  const t0 = Date.now();
  await prisma.$transaction(
    async (tx) => {
      await tx.accountAnalytics.upsert({
        where: { accountId: acc.id },
        create: { accountId: acc.id, currency: payload.currency },
        update: {},
      });
      await tx.$queryRaw`
        SELECT "id" FROM "account_analytics"
        WHERE "accountId" = ${acc.id}
        FOR UPDATE
      `;
      await tx.accountAnalytics.update({
        where: { accountId: acc.id },
        data: payload,
      });
    },
    { timeout: 15000, maxWait: 5000 }
  );
  console.log("OK upsert in", Date.now() - t0, "ms");
} catch (e) {
  console.error("FAIL", e?.code || "", e?.message);
  if (e?.meta) console.error("meta", JSON.stringify(e.meta));
  if (e?.cause) console.error("cause", e.cause?.message || e.cause);
}

await prisma.$disconnect();
