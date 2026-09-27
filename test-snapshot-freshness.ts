// Check lastSyncedAt and rawSnapshot freshness
import { prisma } from "@/lib/db";

const TARGET_USER_ID = "cmts93y3t0000fssuw5gyqsar";

function toVnDateStr(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
}

function parseVideoVnDate(v: any): string | null {
  const raw = v?.postTime ?? v?.createTime ?? v?.create_time ?? v?.createtime
    ?? v?.post_time ?? v?.uploadTime ?? v?.publishTime ?? v?.timestamp;
  let d: Date | null = null;
  if (raw != null) {
    const sec = Number(raw);
    if (Number.isFinite(sec)) d = new Date(sec > 1e11 ? sec : sec * 1000);
    else { const p = new Date(String(raw)); if (!isNaN(p.getTime())) d = p; }
  }
  if (!d && v?.postDate) { const p = new Date(v.postDate); if (!isNaN(p.getTime())) d = p; }
  if (!d || isNaN(d.getTime())) return null;
  return toVnDateStr(d);
}

async function main() {
  const todayVnStr = toVnDateStr(new Date());
  const windowStart = toVnDateStr(new Date(Date.now() - 7 * 86400000));
  
  console.log(`Today: ${todayVnStr} | Window: ${windowStart} to ${todayVnStr}`);
  console.log("=".repeat(80));

  const accounts = await (prisma as any).tiktokAccount.findMany({
    where: { assignedUserId: TARGET_USER_ID, deletedAt: null },
    select: {
      id: true, username: true, status: true, lastSyncedAt: true,
      analytics: { select: { rawSnapshot: true, updatedAt: true } },
    },
  });

  console.log(`\nAccounts: ${accounts.length}`);
  console.log("\n" + "-".repeat(80));

  for (const acc of accounts) {
    const rawSnap = (acc.analytics as any)?.rawSnapshot;
    const videosList = Array.isArray(rawSnap?.videosList) ? rawSnap.videosList : [];
    const analyticsUpdated = acc.analytics?.updatedAt;
    
    // Find most recent video date in the snapshot
    let mostRecentVideoDate: string | null = null;
    let videosInWindow = 0;
    for (const v of videosList) {
      const dateStr = parseVideoVnDate(v);
      if (!dateStr) continue;
      if (!mostRecentVideoDate || dateStr > mostRecentVideoDate) mostRecentVideoDate = dateStr;
      if (dateStr >= windowStart && dateStr <= todayVnStr) videosInWindow++;
    }

    const syncedStr = acc.lastSyncedAt ? toVnDateStr(new Date(acc.lastSyncedAt)) : "NEVER";
    const analyticsStr = analyticsUpdated ? toVnDateStr(new Date(analyticsUpdated)) : "NEVER";
    const snapshotStale = mostRecentVideoDate ? mostRecentVideoDate < windowStart : true;
    
    console.log(`${acc.username}`);
    console.log(`  status=${acc.status} lastSyncedAt=${syncedStr} analyticsUpdated=${analyticsStr}`);
    console.log(`  rawSnapshot videos=${videosList.length} mostRecentVideo=${mostRecentVideoDate || "NONE"}`);
    console.log(`  videosInWindow(${windowStart} to ${todayVnStr})=${videosInWindow}`);
    console.log(`  snapshotStale=${snapshotStale} -> BACKFILL ${snapshotStale ? "CANNOT HELP (no recent data)" : "CAN WORK"}`);
    console.log();
  }

  console.log("=".repeat(80));
  console.log("CONCLUSION:");
  console.log("Backfill only works if rawSnapshot.videosList has videos in the 7-day window.");
  console.log("Accounts with stale snapshots need to be re-synced by the extension first.");

  await (prisma as any).$disconnect();
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
