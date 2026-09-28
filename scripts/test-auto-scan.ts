import {
  parseVideoVnDate,
  vnDateStrToChecklistDate,
  toVnDateStr,
  backfillChecklistVideos,
  BACKFILL_WINDOW_DAYS,
} from "../src/lib/checklist-video-backfill";
import {
  reconcileChecklistForUserAndDate,
  reconcileRecentChecklistsForUser,
} from "../src/lib/checklist-reconcile";
import {
  getBusinessToday,
  getVnDateStr,
  calculateWorkdayScore,
  ensureDailyChecklistsForDate,
  DEFAULT_SCORING_CONFIG,
  ScoringRuleConfig,
} from "../src/lib/scoring-engine";

// ─── Test helpers ─────────────────────────────────────────────────────────
let total = 0, passed = 0, failed = 0;
function ok(name: string, d?: string) {
  total++; passed++;
  console.log("  OK [PASS] " + name + (d ? " (" + d + ")" : ""));
}
function fail(name: string, d?: string) {
  total++; failed++;
  console.error("  !! [FAIL] " + name + (d ? " -- " + d : ""));
}
function assert(cond: boolean, name: string, d?: string) {
  if (cond) ok(name, d); else fail(name, d);
}
function section(t: string) { console.log("\n=== " + t + " ==="); }

// ─── Shared mock types ────────────────────────────────────────────────────
type MockItem = {
  id: string; checklistId: string; accountId: string;
  isPosted: boolean; isSynced: boolean; isCompleted: boolean;
  videoSource: string | null; videosSnapshot: any; videoSyncedAt: Date | null;
};
type MockChecklist = {
  id: string; userId: string; date: Date; isLocked: boolean;
  totalAssigned: number; completedCount: number; completionRate: number; workdayScore: number;
  items?: MockItem[];
};
type MockAccount = { id: string; assignedUserId: string; status: string; lastSyncedAt: Date | null; deletedAt: null; analytics?: any; };

let mockChecklists: MockChecklist[] = [];
let mockItems: MockItem[] = [];
let mockAccounts: MockAccount[] = [
  { id: "acc-1", assignedUserId: "user-1", status: "ACTIVE", lastSyncedAt: new Date(), deletedAt: null },
  { id: "acc-2", assignedUserId: "user-1", status: "ACTIVE", lastSyncedAt: new Date(), deletedAt: null },
  { id: "acc-3", assignedUserId: "user-2", status: "ACTIVE", lastSyncedAt: new Date(), deletedAt: null },
  { id: "acc-banned", assignedUserId: "user-1", status: "BANNED", lastSyncedAt: null, deletedAt: null },
];

function createMockPrisma() {
  return {
    dailyChecklist: {
      findFirst: async ({ where }: any) => mockChecklists.find(c => {
        if (where.userId && c.userId !== where.userId) return false;
        if (where.date && c.date.getTime() !== where.date.getTime()) return false;
        if (where.isLocked !== undefined && c.isLocked !== where.isLocked) return false;
        return true;
      }) ?? null,
      findUnique: async ({ where }: any) => {
        if (where.id) return mockChecklists.find(c => c.id === where.id) ?? null;
        if (where.userId_date) return mockChecklists.find(c => c.userId === where.userId_date.userId && c.date.getTime() === where.userId_date.date.getTime()) ?? null;
        return null;
      },
      findMany: async ({ where }: any) => mockChecklists.filter(c => {
        if (where.id && c.id !== where.id) return false;
        if (where.userId) {
          if (typeof where.userId === "string" && c.userId !== where.userId) return false;
          if (where.userId.in && !where.userId.in.includes(c.userId)) return false;
        }
        if (where.date) {
          if (where.date.in) { const ts = where.date.in.map((d: Date) => d.getTime()); if (!ts.includes(c.date.getTime())) return false; }
          if (where.date.gte && c.date.getTime() < where.date.gte.getTime()) return false;
        }
        if (where.isLocked !== undefined && c.isLocked !== where.isLocked) return false;
        return true;
      }).map(c => ({
        ...c,
        items: mockItems.filter(i => i.checklistId === c.id).map(i => ({ ...i, account: mockAccounts.find(a => a.id === i.accountId) ?? null })),
        user: { id: c.userId, name: c.userId },
      })),
      create: async ({ data }: any) => {
        const id = "chk-" + (mockChecklists.length + 1);
        const n: MockChecklist = { id, userId: data.userId, date: data.date, isLocked: false, totalAssigned: data.totalAssigned || 0, completedCount: data.completedCount || 0, completionRate: data.completionRate || 0, workdayScore: data.workdayScore || 0, items: [] };
        if (data.items?.create) for (const d of data.items.create) { const it: MockItem = { id: "item-" + (mockItems.length+1), checklistId: id, accountId: d.accountId, isPosted: d.isPosted||false, isSynced: d.isSynced||false, isCompleted: d.isCompleted||false, videoSource: null, videosSnapshot: null, videoSyncedAt: null }; mockItems.push(it); n.items!.push(it); }
        mockChecklists.push(n); return n;
      },
      update: async ({ where, data }: any) => { const f = mockChecklists.find(c => c.id === where.id); if (f) Object.assign(f, data); return f; },
      upsert: async ({ where, create, update }: any) => {
        const f = where.id ? mockChecklists.find(c => c.id === where.id) : where.userId_date ? mockChecklists.find(c => c.userId === where.userId_date.userId && c.date.getTime() === where.userId_date.date.getTime()) : null;
        if (f) { Object.assign(f, update); return f; }
        return (createMockPrisma().dailyChecklist.create as any)({ data: create });
      },
    },
    dailyChecklistItem: {
      findFirst: async ({ where }: any) => mockItems.find(i => {
        if (where.accountId && i.accountId !== where.accountId) return false;
        if (where.checklist?.date) { const c = mockChecklists.find(c => c.id === i.checklistId); if (!c || c.date.getTime() !== where.checklist.date.getTime()) return false; if (where.checklist.isLocked !== undefined && c.isLocked !== where.checklist.isLocked) return false; }
        return true;
      }) ?? null,
      findMany: async ({ where }: any) => mockItems.filter(i => {
        if (where.checklistId && i.checklistId !== where.checklistId) return false;
        return true;
      }).map(i => ({ ...i, account: mockAccounts.find(a => a.id === i.accountId) ?? null })),
      create: async ({ data }: any) => { const it: MockItem = { id: "item-" + (mockItems.length+1), checklistId: data.checklistId, accountId: data.accountId, isPosted: data.isPosted||false, isSynced: data.isSynced||false, isCompleted: data.isCompleted||false, videoSource: null, videosSnapshot: null, videoSyncedAt: null }; mockItems.push(it); return it; },
      update: async ({ where, data }: any) => { const f = mockItems.find(i => i.id === where.id); if (f) Object.assign(f, data); return f; },
      upsert: async ({ where, create, update }: any) => { const f = mockItems.find(i => i.checklistId === where.checklistId_accountId?.checklistId && i.accountId === where.checklistId_accountId?.accountId); if (f) { Object.assign(f, update); return f; } return (createMockPrisma().dailyChecklistItem.create as any)({ data: create }); },
    },
    tiktokAccount: {
      findMany: async ({ where }: any) => mockAccounts.filter(a => {
        if (where.assignedUserId) { if (typeof where.assignedUserId === "string" && a.assignedUserId !== where.assignedUserId) return false; if (where.assignedUserId.in && !where.assignedUserId.in.includes(a.assignedUserId)) return false; }
        if (where.deletedAt === null && a.deletedAt !== null) return false;
        return true;
      }),
      findUnique: async ({ where }: any) => mockAccounts.find(a => a.id === where.id) ?? null,
    },
    accountAssignmentHistory: { findFirst: async () => null },
    systemConfig: { findUnique: async () => null },
    user: { findMany: async () => [] },
    $executeRawUnsafe: async () => 0,
    $queryRawUnsafe: async () => [],
    $transaction: async (fn: any) => fn(createMockPrisma()),
  };
}

// ─── AutoScan logic (mirrors server procedure exactly) ───────────────────
function parseDateOnly(s: string): Date { const [y,m,d] = s.split("-").map(Number); return new Date(Date.UTC(y,m-1,d)); }

async function runAutoScan(prisma: any, opts: { date?: string; startDate?: string; endDate?: string; checklistId?: string }) {
  const cfg = DEFAULT_SCORING_CONFIG;
  const shouldExcludeBanned = cfg.excludeBannedAccounts !== false;
  const { todayDateOnly } = getBusinessToday();
  const DAY = 86400000;
  const sixAgo = new Date(todayDateOnly.getTime() - 6 * DAY);
  let scanDates: Date[];
  let targetChecklist: any = null;
  if (opts.checklistId) {
    targetChecklist = await prisma.dailyChecklist.findUnique({ where: { id: opts.checklistId } });
    if (!targetChecklist) throw new Error("Checklist not found: " + opts.checklistId);
    scanDates = [new Date(targetChecklist.date)];
  } else if (opts.date) {
    const d = parseDateOnly(opts.date);
    if (d < sixAgo || d > todayDateOnly) throw new Error("Date " + opts.date + " outside 7-day window");
    scanDates = [d];
  } else if (opts.startDate && opts.endDate) {
    let s = parseDateOnly(opts.startDate), e = parseDateOnly(opts.endDate);
    if (s > e) throw new Error("startDate > endDate");
    if (s < sixAgo) s = sixAgo; if (e > todayDateOnly) e = todayDateOnly;
    if (s > e) throw new Error("Range outside 7-day window");
    scanDates = []; for (let c = new Date(s); c <= e; c = new Date(c.getTime()+DAY)) scanDates.push(new Date(c));
  } else { scanDates = [todayDateOnly]; }
  let totalCreated = 0;
  for (const d of scanDates) { try { const r = await ensureDailyChecklistsForDate(prisma, d); totalCreated += r.createdCount; } catch {} }
  const allAccounts = await prisma.tiktokAccount.findMany({ where: { deletedAt: null, ...(opts.checklistId && targetChecklist ? { assignedUserId: targetChecklist.userId } : {}) } });
  const vBAD = new Map<string, Map<string, any[]>>();
  let totalVideos = 0;
  for (const acc of allAccounts) {
    const vl: any[] = acc.analytics?.rawSnapshot?.videosList ?? [];
    if (!vl.length) continue;
    const byDate = new Map<string, any[]>();
    for (const v of vl) {
      const raw = v.postDate ?? v.createTime ?? v.uploadTime ?? v.publishTime ?? v.timestamp;
      if (raw == null) continue;
      const dd = typeof raw === "number" ? new Date(raw > 1e10 ? raw : raw*1000) : new Date(raw as string);
      if (isNaN(dd.getTime())) continue;
      const k = getVnDateStr(dd);
      if (!byDate.has(k)) byDate.set(k,[]); byDate.get(k)!.push(v);
    }
    if (byDate.size > 0) vBAD.set(acc.id, byDate);
  }
  const chkWhere: any = { date: { in: scanDates }, ...(opts.checklistId ? { id: opts.checklistId } : {}) };
  const checklists = await prisma.dailyChecklist.findMany({ where: chkWhere });
  let staffScanned = 0, acctScanned = 0, postedCount = 0, updated = 0;
  const accsWithVids = new Set<string>();
  for (const chk of checklists) {
    staffScanned++;
    const vnDate = getVnDateStr(new Date(chk.date));
    const dateOnly = new Date(chk.date);
    let anyChanged = false; const ups: Promise<any>[] = [];
    for (const item of chk.items) {
      acctScanned++;
      if (item.account?.deletedAt) continue;
      const vids: any[] = vBAD.get(item.account?.id ?? item.accountId)?.get(vnDate) ?? [];
      const hasVid = vids.length > 0;
      if (hasVid) { accsWithVids.add(item.account?.id ?? item.accountId); totalVideos += vids.length; }
      const hasSnap = Array.isArray(item.videosSnapshot) && item.videosSnapshot.length > 0;
      const synced = Boolean(item.account?.lastSyncedAt && new Date(item.account.lastSyncedAt) >= dateOnly);
      const nPost = item.isPosted || hasVid, nSync = item.isSynced || synced, nComp = nPost || item.isCompleted;
      if (nPost) postedCount++;
      const changed = nPost !== item.isPosted || nSync !== item.isSynced || nComp !== item.isCompleted || (hasVid && !hasSnap);
      if (changed) { anyChanged = true; ups.push(prisma.dailyChecklistItem.update({ where: { id: item.id }, data: { isPosted: nPost, isSynced: nSync, isCompleted: nComp, ...(hasVid && !hasSnap ? { videosSnapshot: vids, videoSource: "live", videoSyncedAt: new Date() } : {}) } })); }
    }
    if (ups.length) await Promise.all(ups);
    const fresh = await prisma.dailyChecklistItem.findMany({ where: { checklistId: chk.id } });
    const eligible = fresh.filter((i: any) => i.account && !i.account.deletedAt && !(shouldExcludeBanned && i.account.status === "BANNED"));
    const ta = eligible.length, cc = eligible.filter((i: any) => i.isCompleted || i.isPosted).length;
    const { completionRate, workdayScore } = calculateWorkdayScore(ta, cc, cfg);
    await prisma.dailyChecklist.update({ where: { id: chk.id }, data: { totalAssigned: ta, completedCount: cc, completionRate, workdayScore } });
    if (anyChanged) updated++;
  }
  return { datesProcessed: scanDates.length, staffScanned, acctScanned, postedCount, updated, totalVideos, accountsWithVideos: accsWithVids.size, totalCreated, rangeStart: scanDates[0].toISOString().slice(0,10), rangeEnd: scanDates[scanDates.length-1].toISOString().slice(0,10) };
}

// ═════════════════════════════════════════════════════════════════════════
async function runTestSuite() {
  console.log("=================================================================");
  console.log("BACKFILL + AUTO-SCAN (CHOT CHAM CONG) — COMPREHENSIVE TEST");
  console.log("=================================================================");
  const { todayStr, todayDateOnly } = getBusinessToday();
  const DAY = 86400000;
  const [y, mo, dd] = todayStr.split("-").map(Number);
  const offset = (n: number) => toVnDateStr(new Date(Date.UTC(y, mo-1, dd-n)));
  const yesterdayStr = offset(1), twoDaysAgoStr = offset(2), sevenDaysAgoStr = offset(6), eightDaysAgoStr = offset(8);
  console.log("Today (VN): " + todayStr);

  // ── PART A: BACKFILL SYSTEM ──────────────────────────────────────────────
  section("A1 - parseVideoVnDate: timestamp parsing");
  const d1 = new Date(Date.UTC(2026,8,23,3,0,0));
  assert(parseVideoVnDate({ createTime: Math.floor(d1.getTime()/1000) }) === "2026-09-23", "Parses unix seconds timestamp");
  assert(parseVideoVnDate({ create_time: Math.floor(new Date(Date.UTC(2026,8,23,18,0,0)).getTime()/1000) }) === "2026-09-24", "VN timezone rollover (UTC 18:00 => next day VN)");
  assert(parseVideoVnDate({ createtime: d1.getTime() }) === "2026-09-23", "Parses millisecond timestamp");
  assert(parseVideoVnDate({ createTime: "2026-09-22T08:00:00.000Z" }) === "2026-09-22", "Parses ISO string");
  assert(parseVideoVnDate({ postDate: "2026-09-21 15:30:00" }) === "2026-09-21", "Falls back to postDate field");
  assert(parseVideoVnDate(null) === null, "Returns null on null input");
  assert(parseVideoVnDate({ foo: "bar" }) === null, "Returns null when no date field");

  section("A2 - Date conversion utilities");
  const pd = vnDateStrToChecklistDate("2026-09-20");
  assert(pd.getUTCFullYear()===2026 && pd.getUTCMonth()===8 && pd.getUTCDate()===20 && pd.getUTCHours()===0, "vnDateStrToChecklistDate produces UTC midnight", pd.toISOString());
  assert(toVnDateStr(new Date(Date.UTC(2026,8,20,0,0,0))) === "2026-09-20", "toVnDateStr roundtrips YYYY-MM-DD correctly");

  section("A3 - backfillChecklistVideos: core scenarios");
  // A3.1: today allowed by default; skipped when locked or includeToday:false
  { mockChecklists=[]; mockItems=[]; const p=createMockPrisma();
    // With includeToday:false — explicitly skip today without even attempting
    const r1=await backfillChecklistVideos(p,"acc-1",[{id:"v",createTime:Math.floor(Date.now()/1000)}],todayStr,7,{includeToday:false});
    assert(!r1.written.includes(todayStr),"A3.1a today explicitly skipped via includeToday:false",`written=${r1.written}`);
    // Locked today checklist — skips with 'locked'
    mockChecklists=[]; mockItems=[];
    const todayDate=vnDateStrToChecklistDate(todayStr);
    const lockedChk: MockChecklist={id:"chk-locked-td",userId:"user-1",date:todayDate,isLocked:true,totalAssigned:1,completedCount:0,completionRate:0,workdayScore:0,items:[]};
    const lockedItem: MockItem={id:"il-td",checklistId:"chk-locked-td",accountId:"acc-1",isPosted:false,isSynced:false,isCompleted:false,videoSource:null,videosSnapshot:null,videoSyncedAt:null};
    lockedChk.items=[lockedItem]; mockChecklists.push(lockedChk); mockItems.push(lockedItem);
    const r2=await backfillChecklistVideos(p,"acc-1",[{id:"v2",createTime:Math.floor(Date.now()/1000)}],todayStr);
    assert(r2.skipped[todayStr]==="locked","A3.1b locked today checklist is skipped",`skipped=${JSON.stringify(r2.skipped)}`); }
  // A3.2: skip outside window
  { mockChecklists=[]; mockItems=[]; const p=createMockPrisma(); const ed=vnDateStrToChecklistDate(eightDaysAgoStr); const r=await backfillChecklistVideos(p,"acc-1",[{id:"v",createTime:Math.floor(ed.getTime()/1000)}],todayStr); assert(r.skipped[eightDaysAgoStr]==="outside_window","A3.2 skips videos outside 7-day window",`reason=${r.skipped[eightDaysAgoStr]}`); }
  // A3.3: successful backfill
  { mockChecklists=[]; mockItems=[]; const p=createMockPrisma(); const yd=vnDateStrToChecklistDate(yesterdayStr);
    const chk: MockChecklist={id:"chk-y",userId:"user-1",date:yd,isLocked:false,totalAssigned:2,completedCount:0,completionRate:0,workdayScore:0,items:[]};
    const i1: MockItem={id:"i1",checklistId:"chk-y",accountId:"acc-1",isPosted:false,isSynced:false,isCompleted:false,videoSource:null,videosSnapshot:null,videoSyncedAt:null};
    const i2: MockItem={id:"i2",checklistId:"chk-y",accountId:"acc-2",isPosted:false,isSynced:false,isCompleted:false,videoSource:null,videosSnapshot:null,videoSyncedAt:null};
    chk.items=[i1,i2]; mockChecklists.push(chk); mockItems.push(i1,i2);
    const r=await backfillChecklistVideos(p,"acc-1",[{id:"vv",title:"T",createTime:Math.floor(yd.getTime()/1000)+3600}],todayStr);
    assert(r.written.includes(yesterdayStr),"A3.3 writes backfill for yesterday");
    assert(i1.isPosted===true && i1.videoSource==="backfill","A3.3 item isPosted=true, videoSource=backfill");
    assert(Array.isArray(i1.videosSnapshot) && i1.videosSnapshot.length===1,"A3.3 videosSnapshot populated with 1 video");
    assert(chk.completedCount===1 && chk.completionRate===50,"A3.3 score recalculated (1/2=50%)",`completed=${chk.completedCount} rate=${chk.completionRate}`);
  }
  // A3.4: idempotency
  { const p=createMockPrisma(); const yd=vnDateStrToChecklistDate(yesterdayStr); const r2=await backfillChecklistVideos(p,"acc-1",[{id:"vv",createTime:Math.floor(yd.getTime()/1000)+3600}],todayStr); assert(r2.skipped[yesterdayStr]==="no_change","A3.4 idempotent: repeat run skips with no_change"); }
  // A3.5: source precedence
  { const i1=mockItems.find(i=>i.accountId==="acc-1")!; i1.videoSource="live"; const p=createMockPrisma(); const yd=vnDateStrToChecklistDate(yesterdayStr); const rl=await backfillChecklistVideos(p,"acc-1",[{id:"vx",createTime:Math.floor(yd.getTime()/1000)+3600}],todayStr); assert(rl.skipped[yesterdayStr]==="precedence_live","A3.5a source precedence: skips live"); i1.videoSource="manual"; const p2=createMockPrisma(); const rm=await backfillChecklistVideos(p2,"acc-1",[{id:"vy",createTime:Math.floor(yd.getTime()/1000)+3600}],todayStr); assert(rm.skipped[yesterdayStr]==="precedence_manual","A3.5b source precedence: skips manual"); }
  // A3.6: locked checklist protection
  { const chk=mockChecklists.find(c=>c.id==="chk-y")!; chk.isLocked=true; const p=createMockPrisma(); const yd=vnDateStrToChecklistDate(yesterdayStr); const rk=await backfillChecklistVideos(p,"acc-1",[{id:"vz",createTime:Math.floor(yd.getTime()/1000)+3600}],todayStr); assert(rk.skipped[yesterdayStr]==="locked","A3.6 locked checklist not modified"); }

  section("A4 - Reconciliation (reconcileChecklistForUserAndDate)");
  { mockChecklists=[]; mockItems=[]; const p=createMockPrisma(); const past=vnDateStrToChecklistDate(twoDaysAgoStr); const pc=await reconcileChecklistForUserAndDate(p,"user-1",past); assert(pc !== null,"A4.1 creates past checklist",`totalAssigned=${pc?.totalAssigned}`); (mockAccounts[0] as any).analytics={rawSnapshot:{videosList:[{id:"raw1",createTime:Math.floor(past.getTime()/1000)+7200}]}}; await reconcileRecentChecklistsForUser(p,"user-1",7); assert(mockChecklists.length>=7,"A4.2 ensures 7-day window of checklists",`count=${mockChecklists.length}`); const bf=mockItems.find(i=>i.accountId==="acc-1" && i.videoSource==="backfill"); assert(bf!==undefined && bf.isPosted===true,"A4.3 backfills rawSnapshot video onto past item",`id=${bf?.id}`); }

  // ── PART B: AUTO-SCAN (Chot Cham Cong Tu Dong) ──────────────────────────
  section("B1 - Scan today: marks posted account, updates score");
  { mockChecklists=[]; mockItems=[]; const p=createMockPrisma(); const date=todayDateOnly;
    const chk: MockChecklist={id:"chk-t",userId:"user-1",date,isLocked:false,totalAssigned:2,completedCount:0,completionRate:0,workdayScore:0,items:[]};
    const i1: MockItem={id:"it1",checklistId:"chk-t",accountId:"acc-1",isPosted:false,isSynced:false,isCompleted:false,videoSource:null,videosSnapshot:null,videoSyncedAt:null};
    const i2: MockItem={id:"it2",checklistId:"chk-t",accountId:"acc-2",isPosted:false,isSynced:false,isCompleted:false,videoSource:null,videosSnapshot:null,videoSyncedAt:null};
    chk.items=[i1,i2]; mockChecklists.push(chk); mockItems.push(i1,i2);
    (mockAccounts[0] as any).analytics={rawSnapshot:{videosList:[{id:"vtd",createTime:Math.floor(date.getTime()/1000)+3600}]}};
    (mockAccounts[1] as any).analytics={rawSnapshot:undefined};
    const r=await runAutoScan(p,{date:todayStr});
    assert(r.datesProcessed===1,"B1 datesProcessed=1");
    assert(r.staffScanned===1,"B1 found 1 checklist");
    assert(i1.isPosted===true,"B1 acc-1 isPosted=true (has video)");
    assert(i1.isCompleted===true,"B1 acc-1 isCompleted=true");
    assert(i1.videoSource==="live","B1 videoSource=live (not backfill)");
    assert(Array.isArray(i1.videosSnapshot) && i1.videosSnapshot.length===1,"B1 videosSnapshot has 1 video");
    assert(i2.isPosted===false,"B1 acc-2 stays unposted (no video)");
    assert(chk.completedCount===1,"B1 completedCount=1");
    assert(chk.completionRate===50,"B1 completionRate=50%");
    assert(chk.workdayScore===0.5,"B1 workdayScore=0.5 (50% => half day)",`score=${chk.workdayScore}`);
  }

  section("B2 - Scan yesterday: both accounts posted = full day");
  { mockChecklists=[]; mockItems=[]; const p=createMockPrisma(); const yd=parseDateOnly(yesterdayStr);
    const chk: MockChecklist={id:"chk-y2",userId:"user-1",date:yd,isLocked:false,totalAssigned:2,completedCount:0,completionRate:0,workdayScore:0,items:[]};
    const i1: MockItem={id:"iy1",checklistId:"chk-y2",accountId:"acc-1",isPosted:false,isSynced:false,isCompleted:false,videoSource:null,videosSnapshot:null,videoSyncedAt:null};
    const i2: MockItem={id:"iy2",checklistId:"chk-y2",accountId:"acc-2",isPosted:false,isSynced:false,isCompleted:false,videoSource:null,videosSnapshot:null,videoSyncedAt:null};
    chk.items=[i1,i2]; mockChecklists.push(chk); mockItems.push(i1,i2);
    const yts=Math.floor(yd.getTime()/1000)+3600;
    (mockAccounts[0] as any).analytics={rawSnapshot:{videosList:[{id:"vy1",createTime:yts}]}};
    (mockAccounts[1] as any).analytics={rawSnapshot:{videosList:[{id:"vy2",createTime:yts}]}};
    await runAutoScan(p,{date:yesterdayStr});
    assert(i1.isPosted===true && i2.isPosted===true,"B2 both accounts marked posted");
    assert(chk.completedCount===2,"B2 completedCount=2");
    assert(chk.workdayScore===1.0,"B2 workdayScore=1.0 (full day at 100%)",`score=${chk.workdayScore}`);
  }

  section("B3 - 3-day range scan");
  { mockChecklists=[]; mockItems=[]; const p=createMockPrisma();
    for (let i=0;i<3;i++) { const date=parseDateOnly(offset(i)); const chk: MockChecklist={id:"chk3-"+i,userId:"user-1",date,isLocked:false,totalAssigned:1,completedCount:0,completionRate:0,workdayScore:0,items:[]}; const it: MockItem={id:"i3-"+i,checklistId:"chk3-"+i,accountId:"acc-1",isPosted:false,isSynced:false,isCompleted:false,videoSource:null,videosSnapshot:null,videoSyncedAt:null}; chk.items=[it]; mockChecklists.push(chk); mockItems.push(it); }
    const r=await runAutoScan(p,{startDate:offset(2),endDate:todayStr});
    assert(r.datesProcessed===3,"B3 datesProcessed=3");
    assert(r.staffScanned===3,"B3 scanned all 3 checklists");
  }

  section("B4 - 7-day range scan (full window)");
  { mockChecklists=[]; mockItems=[]; const p=createMockPrisma();
    for (let i=0;i<7;i++) { const date=parseDateOnly(offset(i)); const chk: MockChecklist={id:"chk7-"+i,userId:"user-1",date,isLocked:false,totalAssigned:1,completedCount:0,completionRate:0,workdayScore:0,items:[]}; const it: MockItem={id:"i7-"+i,checklistId:"chk7-"+i,accountId:"acc-1",isPosted:false,isSynced:false,isCompleted:false,videoSource:null,videosSnapshot:null,videoSyncedAt:null}; chk.items=[it]; mockChecklists.push(chk); mockItems.push(it); }
    const r=await runAutoScan(p,{startDate:sevenDaysAgoStr,endDate:todayStr});
    assert(r.datesProcessed===7,"B4 datesProcessed=7");
    assert(r.staffScanned===7,"B4 all 7 checklists scanned");
  }

  section("B5 - Per-row checklistId path");
  { mockChecklists=[]; mockItems=[]; const p=createMockPrisma(); const date=todayDateOnly;
    const chk: MockChecklist={id:"chk-byid",userId:"user-1",date,isLocked:false,totalAssigned:1,completedCount:0,completionRate:0,workdayScore:0,items:[]};
    const it: MockItem={id:"ibyid",checklistId:"chk-byid",accountId:"acc-1",isPosted:false,isSynced:false,isCompleted:false,videoSource:null,videosSnapshot:null,videoSyncedAt:null};
    chk.items=[it]; mockChecklists.push(chk); mockItems.push(it);
    const r=await runAutoScan(p,{checklistId:"chk-byid"});
    assert(r.datesProcessed===1,"B5 datesProcessed=1");
    assert(r.staffScanned===1,"B5 scanned exactly 1 checklist");
    assert(r.acctScanned===1,"B5 scanned 1 account item");
  }

  section("B6 - Out-of-range rejection");
  { const p=createMockPrisma();
    try { await runAutoScan(p,{date:eightDaysAgoStr}); fail("B6a should reject 8-days-ago"); } catch(e:any) { assert(e.message.includes("window"),"B6a rejects date > 6 days ago",e.message); }
    try { await runAutoScan(p,{date:offset(-2)}); fail("B6b should reject future date"); } catch(e:any) { assert(e.message.includes("window"),"B6b rejects future date",e.message); }
    try { await runAutoScan(p,{checklistId:"no-such-id"}); fail("B6c should reject missing checklistId"); } catch(e:any) { assert(e.message.toLowerCase().includes("not found"),"B6c rejects non-existent checklistId",e.message); }
  }

  section("B7 - Idempotency: re-scan does not duplicate videosSnapshot or double-count");
  { mockChecklists=[]; mockItems=[]; const p=createMockPrisma(); const date=todayDateOnly;
    const chk: MockChecklist={id:"chk-id2",userId:"user-1",date,isLocked:false,totalAssigned:1,completedCount:0,completionRate:0,workdayScore:0,items:[]};
    const it: MockItem={id:"iid2",checklistId:"chk-id2",accountId:"acc-1",isPosted:false,isSynced:false,isCompleted:false,videoSource:null,videosSnapshot:null,videoSyncedAt:null};
    chk.items=[it]; mockChecklists.push(chk); mockItems.push(it);
    (mockAccounts[0] as any).analytics={rawSnapshot:{videosList:[{id:"videm",createTime:Math.floor(date.getTime()/1000)+3600}]}};
    await runAutoScan(p,{date:todayStr});
    const snapLen=Array.isArray(it.videosSnapshot)?it.videosSnapshot.length:0;
    assert(it.isPosted===true,"B7 first run marks isPosted=true");
    await runAutoScan(p,{date:todayStr});
    const snapLen2=Array.isArray(it.videosSnapshot)?it.videosSnapshot.length:0;
    assert(snapLen2===snapLen,"B7 snapshot not duplicated on re-scan",`before=${snapLen} after=${snapLen2}`);
    assert(chk.completedCount===1,"B7 completedCount stays 1 (no double-count)");
  }

  section("B8 - Banned account excluded from workdayScore (excludeBannedAccounts=true)");
  { mockChecklists=[]; mockItems=[]; const p=createMockPrisma(); const date=todayDateOnly;
    const chk: MockChecklist={id:"chk-ban",userId:"user-1",date,isLocked:false,totalAssigned:3,completedCount:0,completionRate:0,workdayScore:0,items:[]};
    const ia: MockItem={id:"iba1",checklistId:"chk-ban",accountId:"acc-1",isPosted:false,isSynced:false,isCompleted:false,videoSource:null,videosSnapshot:null,videoSyncedAt:null};
    const ib: MockItem={id:"iba2",checklistId:"chk-ban",accountId:"acc-2",isPosted:false,isSynced:false,isCompleted:false,videoSource:null,videosSnapshot:null,videoSyncedAt:null};
    const ic: MockItem={id:"ibab",checklistId:"chk-ban",accountId:"acc-banned",isPosted:false,isSynced:false,isCompleted:false,videoSource:null,videosSnapshot:null,videoSyncedAt:null};
    chk.items=[ia,ib,ic]; mockChecklists.push(chk); mockItems.push(ia,ib,ic);
    (mockAccounts[0] as any).analytics={rawSnapshot:{videosList:[{id:"vb1",createTime:Math.floor(date.getTime()/1000)+3600}]}};
    (mockAccounts[1] as any).analytics={rawSnapshot:undefined};
    await runAutoScan(p,{date:todayStr});
    assert(chk.totalAssigned===2,"B8 banned excluded from totalAssigned",`totalAssigned=${chk.totalAssigned}`);
    assert(chk.completedCount===1,"B8 completedCount=1 (only acc-1 posted)");
    assert(chk.workdayScore===0.5,"B8 workdayScore=0.5 with banned excluded",`score=${chk.workdayScore}`);
  }

  section("B9 - workdayScore threshold boundary conditions");
  { const cfg=DEFAULT_SCORING_CONFIG;
    assert(calculateWorkdayScore(5,0,cfg).workdayScore===0.0,"B9 0/5=0% => 0.0 workdayScore");
    assert(calculateWorkdayScore(5,2,cfg).workdayScore===0.0,"B9 2/5=40% => 0.0 (below 50% threshold)");
    assert(calculateWorkdayScore(5,3,cfg).workdayScore===0.5,"B9 3/5=60% => 0.5 (above 50% threshold)");
    assert(calculateWorkdayScore(5,4,cfg).workdayScore===0.5,"B9 4/5=80% => 0.5 (below 85% threshold)");
    assert(calculateWorkdayScore(5,5,cfg).workdayScore===1.0,"B9 5/5=100% => 1.0");
    assert(calculateWorkdayScore(20,17,cfg).workdayScore===1.0,"B9 17/20=85% => 1.0 (exactly at full-day threshold)");
    assert(calculateWorkdayScore(0,0,cfg).workdayScore===0.0,"B9 0 assigned => 0.0 (special case)");
  }

  section("B10 - Existing snapshot not overwritten on re-scan (hasExistingSnapshot guard)");
  { mockChecklists=[]; mockItems=[]; const p=createMockPrisma(); const date=todayDateOnly;
    const chk: MockChecklist={id:"chk-src",userId:"user-1",date,isLocked:false,totalAssigned:1,completedCount:1,completionRate:100,workdayScore:1,items:[]};
    const it: MockItem={id:"isrc",checklistId:"chk-src",accountId:"acc-1",isPosted:true,isSynced:true,isCompleted:true,videoSource:"live",videosSnapshot:[{id:"existing"}],videoSyncedAt:new Date()};
    chk.items=[it]; mockChecklists.push(chk); mockItems.push(it);
    (mockAccounts[0] as any).analytics={rawSnapshot:{videosList:[{id:"v-new",createTime:Math.floor(date.getTime()/1000)+7200}]}};
    await runAutoScan(p,{date:todayStr});
    assert(it.videosSnapshot.length===1 && it.videosSnapshot[0].id==="existing","B10 existing snapshot not overwritten",`snapLen=${it.videosSnapshot.length}`);
  }

  // ── Summary ─────────────────────────────────────────────────────────────
  console.log("");
  console.log("=================================================================");
  console.log("RESULTS: " + passed + "/" + total + " PASSED  (" + failed + " failed)");
  if (failed===0) console.log("ALL TESTS PASSED!");
  else { console.error(failed + " TESTS FAILED"); process.exit(1); }
  console.log("=================================================================");
}

runTestSuite().catch(e => { console.error(e); process.exit(1); });