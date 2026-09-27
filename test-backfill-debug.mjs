// Backfill debug script - runs as ESM from project root
// Usage: node test-backfill-debug.mjs
import { PrismaClient } from "@/generated/prisma";

const prisma = new PrismaClient();
const TARGET_USER_ID = "cmts93y3t0000fssuw5gyqsar";

function toVnDateStr(d) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
}

function vnDateStrToChecklistDate(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function parseVideoVnDate(v) {
  const raw = v?.postTime ?? v?.createTime ?? v?.create_time ?? v?.createtime
    ?? v?.post_time ?? v?.uploadTime ?? v?.publishTime ?? v?.timestamp;
  let d = null;
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
  const accounts = await prisma.tiktokAccount.findMany({
    where: { assignedUserId: TARGET_USER_ID, deletedAt: null },
    select: {
      id: true, username: true, status: true,
      analytics: { select: { rawSnapshot: true } },
    },
  });
  console.log(`\nAccounts assigned: ${accounts.length}`);

  // Get all checklists for this user (last 8 days)
  const sevenDaysAgo = vnDateStrToChecklistDate(toVnDateStr(new Date(Date.now() - 7 * 86400000)));
  const todayUtc = vnDateStrToChecklistDate(todayVnStr);
  const windowStartStr = toVnDateStr(sevenDaysAgo);

  const checklists = await prisma.dailyChecklist.findMany({
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
    const postedCount = cl.items.filter(i => i.isPosted).length;
    const completedCount = cl.items.filter(i => i.isCompleted).length;
    const backfilledItems = cl.items.filter(i => i.videoSource === "backfill");
    const hasVideos = cl.items.filter(i => Array.isArray(i.videosSnapshot) && i.videosSnapshot.length > 0);
    console.log(`\n  [${dateStr}] locked=${cl.isLocked} score=${Number(cl.workdayScore)} items=${cl.items.length} posted=${postedCount} completed=${completedCount} backfilled=${backfilledItems.length} hasVideos=${hasVideos.length}`);
    for (const item of cl.items) {
      const snapLen = Array.isArray(item.videosSnapshot) ? item.videosSnapshot.length : 0;
      const acc = accounts.find(a => a.id === item.accountId);
      console.log(`    item ${acc?.username || item.accountId.slice(-6)} isPosted=${item.isPosted} isCompleted=${item.isCompleted} source=${item.videoSource || "null"} snapCount=${snapLen}`);
    }
  }

  // Raw snapshot data
  console.log("\n" + "=".repeat(60));
  console.log("RAW SNAPSHOT VIDEO DATES");
  console.log("=".repeat(60));

  for (const acc of accounts) {
    const rawSnap = acc.analytics?.rawSnapshot;
    const videosList = Array.isArray(rawSnap?.videosList) ? rawSnap.videosList : [];
    console.log(`\n  ${acc.username} (${acc.id}) status=${acc.status}`);
    console.log(`  videosList.length = ${videosList.length}`);

    if (videosList.length === 0) continue;

    // Sample first video to understand structure
    const sample = videosList[0];
    const keys = Object.keys(sample || {});
    console.log(`  Sample video keys: ${keys.slice(0, 15).join(", ")}`);
    
    // Show timestamp fields
    const tsFields = ["postTime","createTime","create_time","createtime","post_time","uploadTime","publishTime","timestamp","postDate"];
    const defined = tsFields.filter(k => sample?.[k] != null).map(k => `${k}=${sample[k]}`);
    console.log(`  Sample timestamp fields: ${defined.join(", ") || "NONE FOUND"}`);

    // Group by VN date
    const byDate = new Map();
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
      const cl = checklists.find(c => toVnDateStr(c.date) === dateStr);
      const item = cl?.items.find(i => i.accountId === acc.id);
      
      let action = "?";
      if (!inWindow) action = "SKIP(outside_window)";
      else if (!cl) action = "WOULD_CREATE_CHECKLIST";
      else if (cl.isLocked) action = "SKIP(locked)";
      else if (!item) action = "WOULD_CREATE_ITEM";
      else if (item.videoSource === "live") action = "SKIP(precedence_live)";
      else if (item.videoSource === "manual") action = "SKIP(precedence_manual)";
      else if (item.videoSource === "backfill" && Array.isArray(item.videosSnapshot) && item.videosSnapshot.length > 0) action = "SKIP(no_change?) or UPDATE";
      else action = "WOULD_WRITE";
      
      console.log(`    ${dateStr}: ${vids.length} videos | inWindow=${inWindow} | cl=${cl ? "exists" : "missing"} | item=${item ? `isPosted=${item.isPosted},src=${item.videoSource}` : "missing"} -> ${action}`);
    }
  }

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
