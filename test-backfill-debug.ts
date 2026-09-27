// Backfill debug script
// Usage: npx tsx test-backfill-debug.ts
import { prisma } from "@/lib/db";

const TARGET_USER_ID = "cmts93y3t0000fssuw5gyqsar";

function toVnDateStr(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
}

function vnDateStrToChecklistDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function parseVideoVnDate(v: any): string | null {
  const raw = v?.postTime ?? v?.createTime ?? v?.create_time ?? v?.createtime
    ?? v?.post_time ?? v?.uploadTime ?? v?.publishTime ?? v?.timestamp;
  let d: Date | null = null;
  if (raw != null) {
    const sec = Number(raw);
    if (Number.isFinite(sec)) {
      d = new Date(sec > 1e11 ? sec : sec * 1000);
    } else {
      const parsed = new Date(String(raw));
      if (!isNaN(parsed.getTime())) d = parsed;
    }
  }
  if (!d && v?.postDate) {
    const parsed = new Date(v.postDate);
    if (!isNaN(parsed.getTime())) d = parsed;
  }
  if (!d || isNaN(d.getTime())) return null;
  return toVnDateStr(d);
}

async function main() {
  console.log("=".repeat(60));
  console.log("BACKFILL DEBUG: user", TARGET_USER_ID);
  console.log("=".repeat(60));

  const todayVnStr = toVnDateStr(new Date());
  console.log("\nToday (VN):", todayVnStr);

  // Get all accounts for this user
  const accounts = await (prisma as any).tiktokAccount.findMany({
    where: { assignedUserId: TARGET_USER_ID, deletedAt: null },
    select: {
      id: true, username: true, status: true,
      analytics: { select: { rawSnapshot: true } },
    },
  });
  console.log(`\nAccounts assigned: ${accounts.length}`);

  // Get checklists for this user (last 8 days)
  const todayUtc = vnDateStrToChecklistDate(todayVnStr);
  const sevenDaysAgoMs = todayUtc.getTime() - 7 * 86400000;
  const sevenDaysAgo = new Date(sevenDaysAgoMs);
  const windowStartStr = toVnDateStr(sevenDaysAgo);

  const checklists = await (prisma as any).dailyChecklist.findMany({
    where: {
      userId: TARGET_USER_ID,
      date: { gte: sevenDaysAgo, lte: todayUtc },
    },
    include: { items: true },
    orderBy: { date: "desc" },
  });

  console.log(`\nChecklists in last 7 days: ${checklists.length}`);
  for (const cl of checklists) {
    const dateStr = toVnDateStr(cl.date);
    const postedCount = cl.items.filter((i: any) => i.isPosted).length;
    const completedCount = cl.items.filter((i: any) => i.isCompleted).length;
    const backfilledItems = cl.items.filter((i: any) => i.videoSource === "backfill");
    const hasVideos = cl.items.filter((i: any) => Array.isArray(i.videosSnapshot) && i.videosSnapshot.length > 0);
    console.log(`\n  [${dateStr}] locked=${cl.isLocked} score=${Number(cl.workdayScore)} items=${cl.items.length} posted=${postedCount} completed=${completedCount} backfilled=${backfilledItems.length} hasVideos=${hasVideos.length}`);
    for (const item of cl.items) {
      const snapLen = Array.isArray(item.videosSnapshot) ? item.videosSnapshot.length : 0;
      const acc = accounts.find((a: any) => a.id === item.accountId);
      console.log(`    item ${acc?.username || item.accountId.slice(-6)} isPosted=${item.isPosted} isCompleted=${item.isCompleted} source=${item.videoSource || "null"} snapCount=${snapLen}`);
    }
  }

  // Raw snapshot data analysis
  console.log("\n" + "=".repeat(60));
  console.log("RAW SNAPSHOT VIDEO DATES PER ACCOUNT");
  console.log("=".repeat(60));

  for (const acc of accounts) {
    const rawSnap = (acc.analytics as any)?.rawSnapshot;
    const videosList = Array.isArray(rawSnap?.videosList) ? rawSnap.videosList : [];
    console.log(`\n  ${acc.username} (${acc.id}) status=${acc.status}`);
    console.log(`  videosList.length = ${videosList.length}`);

    if (videosList.length === 0) continue;

    // Show sample video keys
    const sample = videosList[0];
    const keys = Object.keys(sample || {});
    console.log(`  Sample video keys: [${keys.slice(0, 15).join(", ")}]`);

    // Show timestamp fields
    const tsFields = ["postTime","createTime","create_time","createtime","post_time","uploadTime","publishTime","timestamp","postDate"];
    const defined = tsFields.filter(k => (sample as any)?.[k] != null).map(k => `${k}=${(sample as any)[k]}`);
    console.log(`  Sample timestamp fields: ${defined.join(", ") || "NONE FOUND"}`);

    // Group by VN date
    const byDate = new Map<string, any[]>();
    let unparsedCount = 0;
    for (const v of videosList) {
      const dateStr = parseVideoVnDate(v);
      if (!dateStr) { unparsedCount++; continue; }
      const bucket = byDate.get(dateStr) || [];
      bucket.push(v);
      byDate.set(dateStr, bucket);
    }

    if (unparsedCount > 0) console.log(`  WARNING: ${unparsedCount} videos could NOT be date-parsed`);

    const sortedDates = [...byDate.entries()].sort((a, b) => b[0].localeCompare(a[0]));
    for (const [dateStr, vids] of sortedDates) {
      const inWindow = dateStr >= windowStartStr && dateStr <= todayVnStr;

      // Check checklist item for this account + date
      const cl = checklists.find((c: any) => toVnDateStr(c.date) === dateStr);
      const item = cl?.items.find((i: any) => i.accountId === acc.id);

      let action = "?";
      if (!inWindow) action = "SKIP(outside_window)";
      else if (!cl) action = "WOULD_CREATE_CHECKLIST";
      else if (cl.isLocked) action = "SKIP(locked)";
      else if (!item) action = "WOULD_CREATE_ITEM";
      else if (item.videoSource === "live") action = "SKIP(precedence_live)";
      else if (item.videoSource === "manual") action = "SKIP(precedence_manual)";
      else if (item.videoSource === "backfill" && Array.isArray(item.videosSnapshot) && item.videosSnapshot.length > 0) action = "ALREADY_BACKFILLED (would check no_change)";
      else action = `WOULD_WRITE (isPosted=${item?.isPosted}, source=${item?.videoSource || "null"})`;

      console.log(`    ${dateStr}: ${vids.length} videos | inWindow=${inWindow} | cl=${cl ? `locked=${cl.isLocked}` : "MISSING"} | item=${item ? `isPosted=${item.isPosted},src=${item.videoSource}` : "MISSING"} -> ${action}`);
    }
  }

  // Check if there are any checklists for dates WITHOUT rawSnapshot coverage
  console.log("\n" + "=".repeat(60));
  console.log("CHECKLIST DATES WITHOUT VIDEO COVERAGE");
  console.log("=".repeat(60));
  for (const cl of checklists) {
    const dateStr = toVnDateStr(cl.date);
    const unpostedItems = cl.items.filter((i: any) => !i.isPosted && !i.isCompleted);
    if (unpostedItems.length > 0) {
      console.log(`\n  [${dateStr}] ${unpostedItems.length} unposted/incomplete items:`);
      for (const item of unpostedItems) {
        const acc = accounts.find((a: any) => a.id === item.accountId);
        // Check if this account has videos in rawSnapshot that should have covered this date
        const rawSnap = (acc?.analytics as any)?.rawSnapshot;
        const videosList = Array.isArray(rawSnap?.videosList) ? rawSnap.videosList : [];
        const videosOnDate = videosList.filter((v: any) => parseVideoVnDate(v) === dateStr);
        console.log(`    ${acc?.username || item.accountId.slice(-6)}: videosOnDate=${videosOnDate.length} source=${item.videoSource || "null"} snap=${Array.isArray(item.videosSnapshot) ? item.videosSnapshot.length : 0}`);
      }
    }
  }

  await (prisma as any).$disconnect();
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
