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
import { getBusinessToday, calculateWorkdayScore, DEFAULT_SCORING_CONFIG } from "../src/lib/scoring-engine";

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  totalTests++;
  if (condition) {
    console.log(`  ✅ [PASS] ${testName}${detail ? ` (${detail})` : ""}`);
    passedTests++;
  } else {
    console.error(`  ❌ [FAIL] ${testName}${detail ? ` - Detail: ${detail}` : ""}`);
    failedTests++;
  }
}

async function runTestSuite() {
  console.log("=====================================================================");
  console.log("🚀 STARTING CHECKLIST BACKFILL & RECONCILIATION TEST SUITE");
  console.log("=====================================================================\n");

  const { todayStr, todayDateOnly } = getBusinessToday();
  console.log(`ℹ️  Business Today (VN): ${todayStr} (UTC: ${todayDateOnly.toISOString()})`);

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. UNIT TESTS: parseVideoVnDate
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\n📦 1. Testing Video Timestamp & VN Date Parsing...");

  // Seconds timestamp: 2026-09-23 03:00:00 UTC = 2026-09-23 10:00:00 VN (+7)
  const d1 = new Date(Date.UTC(2026, 8, 23, 3, 0, 0));
  const sec1 = Math.floor(d1.getTime() / 1000);
  assert(
    parseVideoVnDate({ createTime: sec1 }) === "2026-09-23",
    "Parses seconds unix timestamp correctly",
    `sec: ${sec1} => 2026-09-23`
  );

  // VN Day rollover: 2026-09-23 18:00:00 UTC = 2026-09-24 01:00:00 VN (+7)
  const dLate = new Date(Date.UTC(2026, 8, 23, 18, 0, 0));
  const secLate = Math.floor(dLate.getTime() / 1000);
  assert(
    parseVideoVnDate({ create_time: secLate }) === "2026-09-24",
    "Accounts for Vietnam timezone rollover (+7 hours)",
    `UTC 18:00 on 23rd => VN 01:00 on 24th`
  );

  // Milliseconds timestamp
  const ms1 = d1.getTime();
  assert(
    parseVideoVnDate({ createtime: ms1 }) === "2026-09-23",
    "Parses millisecond timestamp correctly",
    `ms: ${ms1} => 2026-09-23`
  );

  // ISO string in createTime
  assert(
    parseVideoVnDate({ createTime: "2026-09-22T08:00:00.000Z" }) === "2026-09-22",
    "Parses ISO string in createTime",
    "2026-09-22T08:00:00.000Z => 2026-09-22"
  );

  // Fallback to postDate
  assert(
    parseVideoVnDate({ postDate: "2026-09-21 15:30:00" }) === "2026-09-21",
    "Falls back to postDate when createTime is missing",
    "postDate 2026-09-21 => 2026-09-21"
  );

  // Invalid or null
  assert(
    parseVideoVnDate(null) === null,
    "Returns null on null input"
  );
  assert(
    parseVideoVnDate({ foo: "bar" }) === null,
    "Returns null when no date field present"
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. UNIT TESTS: vnDateStrToChecklistDate & toVnDateStr
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\n📦 2. Testing Date Conversions...");

  const parsedDate = vnDateStrToChecklistDate("2026-09-20");
  assert(
    parsedDate.getUTCFullYear() === 2026 &&
    parsedDate.getUTCMonth() === 8 &&
    parsedDate.getUTCDate() === 20 &&
    parsedDate.getUTCHours() === 0,
    "vnDateStrToChecklistDate generates exact UTC midnight Date",
    parsedDate.toISOString()
  );

  assert(
    toVnDateStr(new Date(Date.UTC(2026, 8, 20, 0, 0, 0))) === "2026-09-20",
    "toVnDateStr correctly converts back to YYYY-MM-DD"
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. MOCK PRISMA INTEGRATION: backfillChecklistVideos
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\n📦 3. Testing backfillChecklistVideos Scenarios...");

  // Helper dates relative to today
  const [y, m, d] = todayStr.split("-").map(Number);
  const getOffsetDateStr = (daysAgo: number) => {
    const dt = new Date(Date.UTC(y, m - 1, d - daysAgo));
    return toVnDateStr(dt);
  };

  const yesterdayStr = getOffsetDateStr(1);
  const twoDaysAgoStr = getOffsetDateStr(2);
  const eightDaysAgoStr = getOffsetDateStr(8); // Outside default 7-day window

  // In-memory mock database state
  type MockItem = {
    id: string;
    checklistId: string;
    accountId: string;
    isPosted: boolean;
    isSynced: boolean;
    isCompleted: boolean;
    videoSource: string | null;
    videosSnapshot: any;
    videoSyncedAt: Date | null;
  };

  type MockChecklist = {
    id: string;
    userId: string;
    date: Date;
    isLocked: boolean;
    totalAssigned: number;
    completedCount: number;
    completionRate: number;
    workdayScore: number;
    items?: MockItem[];
  };

  let mockChecklists: MockChecklist[] = [];
  let mockItems: MockItem[] = [];
  let mockAccounts = [
    { id: "acc-1", assignedUserId: "user-1", status: "ACTIVE", lastSyncedAt: new Date(), deletedAt: null },
    { id: "acc-2", assignedUserId: "user-1", status: "ACTIVE", lastSyncedAt: new Date(), deletedAt: null },
  ];

  function createMockPrisma() {
    return {
      dailyChecklist: {
        findFirst: async ({ where }: any) => {
          return mockChecklists.find((c) => {
            if (where.userId && c.userId !== where.userId) return false;
            if (where.date && c.date.getTime() !== where.date.getTime()) return false;
            if (where.isLocked !== undefined && c.isLocked !== where.isLocked) return false;
            return true;
          }) || null;
        },
        create: async ({ data }: any) => {
          const checklistId = `chk-${mockChecklists.length + 1}`;
          const newChecklist: MockChecklist = {
            id: checklistId,
            userId: data.userId,
            date: data.date,
            isLocked: false,
            totalAssigned: data.totalAssigned || 0,
            completedCount: data.completedCount || 0,
            completionRate: data.completionRate || 0,
            workdayScore: data.workdayScore || 0,
            items: [],
          };
          if (data.items?.create) {
            for (const itemData of data.items.create) {
              const item: MockItem = {
                id: `item-${mockItems.length + 1}`,
                checklistId,
                accountId: itemData.accountId,
                isPosted: itemData.isPosted || false,
                isSynced: itemData.isSynced || false,
                isCompleted: itemData.isCompleted || false,
                videoSource: null,
                videosSnapshot: null,
                videoSyncedAt: null,
              };
              mockItems.push(item);
              newChecklist.items!.push(item);
            }
          }
          mockChecklists.push(newChecklist);
          return newChecklist;
        },
        update: async ({ where, data }: any) => {
          const found = mockChecklists.find((c) => c.id === where.id);
          if (found) Object.assign(found, data);
          return found;
        },
      },
      dailyChecklistItem: {
        findFirst: async ({ where }: any) => {
          return mockItems.find((i) => {
            if (where.accountId && i.accountId !== where.accountId) return false;
            if (where.checklist?.date) {
              const chk = mockChecklists.find((c) => c.id === i.checklistId);
              if (!chk || chk.date.getTime() !== where.checklist.date.getTime()) return false;
              if (where.checklist.isLocked !== undefined && chk.isLocked !== where.checklist.isLocked) return false;
            }
            return true;
          }) || null;
        },
        findMany: async ({ where }: any) => {
          return mockItems.filter((i) => {
            if (where.checklistId && i.checklistId !== where.checklistId) return false;
            return true;
          });
        },
        create: async ({ data }: any) => {
          const item: MockItem = {
            id: `item-${mockItems.length + 1}`,
            checklistId: data.checklistId,
            accountId: data.accountId,
            isPosted: data.isPosted || false,
            isSynced: data.isSynced || false,
            isCompleted: data.isCompleted || false,
            videoSource: null,
            videosSnapshot: null,
            videoSyncedAt: null,
          };
          mockItems.push(item);
          return item;
        },
        update: async ({ where, data }: any) => {
          const found = mockItems.find((i) => i.id === where.id);
          if (found) Object.assign(found, data);
          return found;
        },
      },
      tiktokAccount: {
        findMany: async ({ where }: any) => {
          return mockAccounts.filter((a) => {
            if (where.assignedUserId && a.assignedUserId !== where.assignedUserId) return false;
            if (where.deletedAt === null && a.deletedAt !== null) return false;
            return true;
          });
        },
        findUnique: async ({ where }: any) => {
          return mockAccounts.find((a) => a.id === where.id) || null;
        },
      },
      accountAssignmentHistory: {
        findFirst: async () => null,
      },
      systemConfig: {
        findUnique: async () => null,
      },
      $executeRawUnsafe: async () => 0,
      $queryRawUnsafe: async () => [],
      $transaction: async (fn: any) => fn(createMockPrisma()),
    };
  }

  // TEST 3.1: Skips today's videos
  {
    const mockPrisma = createMockPrisma();
    const result = await backfillChecklistVideos(
      mockPrisma,
      "acc-1",
      [{ id: "vid-today", createTime: Math.floor(new Date().getTime() / 1000) }],
      todayStr
    );
    assert(
      !result.written.includes(todayStr) && Object.keys(result.skipped).length === 0,
      "Skips today's videos cleanly (reserved for live path)",
      `written: [${result.written.join(", ")}]`
    );
  }

  // TEST 3.2: Skips outside 7-day window
  {
    const mockPrisma = createMockPrisma();
    const eightDaysAgoDate = vnDateStrToChecklistDate(eightDaysAgoStr);
    const result = await backfillChecklistVideos(
      mockPrisma,
      "acc-1",
      [{ id: "vid-old", createTime: Math.floor(eightDaysAgoDate.getTime() / 1000) }],
      todayStr
    );
    assert(
      result.skipped[eightDaysAgoStr] === "outside_window",
      "Skips videos outside the backfill window (> 7 days)",
      `reason: ${result.skipped[eightDaysAgoStr]}`
    );
  }

  // TEST 3.3: Successfully backfills yesterday's video and updates score
  {
    mockChecklists = [];
    mockItems = [];
    const mockPrisma = createMockPrisma();
    const yesterdayDate = vnDateStrToChecklistDate(yesterdayStr);

    // Initial checklist exists with 2 accounts, 0 posted
    const chk: MockChecklist = {
      id: "chk-yesterday",
      userId: "user-1",
      date: yesterdayDate,
      isLocked: false,
      totalAssigned: 2,
      completedCount: 0,
      completionRate: 0,
      workdayScore: 0,
      items: [],
    };
    const item1: MockItem = {
      id: "item-1",
      checklistId: "chk-yesterday",
      accountId: "acc-1",
      isPosted: false,
      isSynced: false,
      isCompleted: false,
      videoSource: null,
      videosSnapshot: null,
      videoSyncedAt: null,
    };
    const item2: MockItem = {
      id: "item-2",
      checklistId: "chk-yesterday",
      accountId: "acc-2",
      isPosted: false,
      isSynced: false,
      isCompleted: false,
      videoSource: null,
      videosSnapshot: null,
      videoSyncedAt: null,
    };
    chk.items = [item1, item2];
    mockChecklists.push(chk);
    mockItems.push(item1, item2);

    const result = await backfillChecklistVideos(
      mockPrisma,
      "acc-1",
      [{ id: "vid-yest-1", title: "Video Yesterday", createTime: Math.floor(yesterdayDate.getTime() / 1000) + 3600 }],
      todayStr
    );

    assert(
      result.written.includes(yesterdayStr),
      "Successfully writes backfill for yesterday's video"
    );
    assert(
      item1.isPosted === true && item1.videoSource === "backfill",
      "ChecklistItem marked as isPosted=true and videoSource='backfill'"
    );
    assert(
      Array.isArray(item1.videosSnapshot) && item1.videosSnapshot.length === 1,
      "videosSnapshot contains backfilled video"
    );
    assert(
      chk.completedCount === 1 && chk.completionRate === 50,
      "Checklist scores automatically recalculated (1/2 = 50%)",
      `completedCount: ${chk.completedCount}, rate: ${chk.completionRate}%, score: ${chk.workdayScore}`
    );
  }

  // TEST 3.4: Idempotency (re-running on same data skips with 'no_change')
  {
    const mockPrisma = createMockPrisma();
    const yesterdayDate = vnDateStrToChecklistDate(yesterdayStr);

    const resultRepeat = await backfillChecklistVideos(
      mockPrisma,
      "acc-1",
      [{ id: "vid-yest-1", title: "Video Yesterday", createTime: Math.floor(yesterdayDate.getTime() / 1000) + 3600 }],
      todayStr
    );

    assert(
      resultRepeat.skipped[yesterdayStr] === "no_change",
      "Idempotent: Identical repeat backfill skips with 'no_change'",
      `skipped: ${JSON.stringify(resultRepeat.skipped)}`
    );
  }

  // TEST 3.5: Precedence — does not overwrite 'live' or 'manual' sources
  {
    const yesterdayDate = vnDateStrToChecklistDate(yesterdayStr);
    const item1 = mockItems.find((i) => i.accountId === "acc-1")!;

    // Set source to 'live'
    item1.videoSource = "live";
    const mockPrisma = createMockPrisma();
    const resLive = await backfillChecklistVideos(
      mockPrisma,
      "acc-1",
      [{ id: "vid-new", title: "New Video", createTime: Math.floor(yesterdayDate.getTime() / 1000) + 3600 }],
      todayStr
    );
    assert(
      resLive.skipped[yesterdayStr] === "precedence_live",
      "Source Precedence: Skips when existing item videoSource is 'live'"
    );

    // Set source to 'manual'
    item1.videoSource = "manual";
    const resManual = await backfillChecklistVideos(
      mockPrisma,
      "acc-1",
      [{ id: "vid-new-2", title: "New Video 2", createTime: Math.floor(yesterdayDate.getTime() / 1000) + 3600 }],
      todayStr
    );
    assert(
      resManual.skipped[yesterdayStr] === "precedence_manual",
      "Source Precedence: Skips when existing item videoSource is 'manual'"
    );
  }

  // TEST 3.6: Locked checklist protection
  {
    const yesterdayDate = vnDateStrToChecklistDate(yesterdayStr);
    const chk = mockChecklists.find((c) => c.id === "chk-yesterday")!;
    chk.isLocked = true; // Finalized checklist

    const mockPrisma = createMockPrisma();
    const resLocked = await backfillChecklistVideos(
      mockPrisma,
      "acc-1",
      [{ id: "vid-new-3", createTime: Math.floor(yesterdayDate.getTime() / 1000) + 3600 }],
      todayStr
    );
    assert(
      resLocked.skipped[yesterdayStr] === "locked",
      "Locked Checklist: Skips finalized/locked checklists without modifying them"
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. TESTING RECONCILIATION: reconcileChecklistForUserAndDate
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\n📦 4. Testing reconcileChecklistForUserAndDate (Past vs Today)...");

  {
    mockChecklists = [];
    mockItems = [];
    const mockPrisma = createMockPrisma();
    const pastDate = vnDateStrToChecklistDate(twoDaysAgoStr);

    // Test creating missing past checklist
    const pastChecklist = await reconcileChecklistForUserAndDate(
      mockPrisma,
      "user-1",
      pastDate
    );

    assert(
      pastChecklist !== null && pastChecklist.totalAssigned === 2,
      "reconcileChecklistForUserAndDate creates past checklist for assigned accounts",
      `totalAssigned: ${pastChecklist?.totalAssigned}`
    );

    // Test reconcileRecentChecklistsForUser (7-day window + rawSnapshot video backfill)
    mockAccounts[0] = {
      ...mockAccounts[0],
      analytics: {
        rawSnapshot: {
          videosList: [
            {
              id: "vid-raw-1",
              title: "Raw Video 1",
              createTime: Math.floor(pastDate.getTime() / 1000) + 7200,
            },
          ],
        },
      },
    } as any;

    await reconcileRecentChecklistsForUser(mockPrisma, "user-1", 7);

    // Verify checklists exist for the 7 days
    assert(
      mockChecklists.length >= 7,
      "reconcileRecentChecklistsForUser ensures checklists exist across full 7-day window",
      `created checklists: ${mockChecklists.length}`
    );

    // Verify video from rawSnapshot was backfilled onto the past item
    const backfilledItem = mockItems.find(
      (i) => i.accountId === "acc-1" && i.videoSource === "backfill"
    );
    assert(
      backfilledItem !== undefined && backfilledItem.isPosted === true,
      "reconcileRecentChecklistsForUser backfills videos from rawSnapshot to past checklist items",
      `backfilled item: ${backfilledItem?.id}, isPosted: ${backfilledItem?.isPosted}`
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // SUMMARY
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\n=====================================================================");
  console.log(`📊 TEST RESULTS: ${passedTests}/${totalTests} PASSED`);
  if (failedTests === 0) {
    console.log("🎉 ALL BACKFILL & RECONCILIATION TESTS PASSED PERFECTLY!");
  } else {
    console.error(`⚠️ ${failedTests} TESTS FAILED!`);
    process.exit(1);
  }
  console.log("=====================================================================\n");
}

runTestSuite().catch((err) => {
  console.error("Test execution error:", err);
  process.exit(1);
});
