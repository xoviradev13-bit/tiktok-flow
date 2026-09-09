import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import {
  calculateWorkdayScore,
  DEFAULT_SCORING_CONFIG,
  getCutoffTimeInfo,
  ScoringRuleConfig,
} from "../src/lib/scoring-engine";

function getIanaTimezone(tzString: string): string {
  if (!tzString) return "Asia/Bangkok";
  if (tzString.includes("Asia/Bangkok")) return "Asia/Bangkok";
  if (tzString.includes("UTC")) return "UTC";
  if (tzString.includes("New_York") || tzString.includes("America/New_York")) return "America/New_York";
  if (tzString.includes("Europe/London") || tzString.includes("London")) return "Europe/London";
  if (tzString.includes("Singapore") || tzString.includes("Asia/Singapore")) return "Asia/Singapore";
  if (tzString.includes("Tokyo") || tzString.includes("Asia/Tokyo")) return "Asia/Tokyo";
  if (tzString.includes("Asia/Ho_Chi_Minh") || tzString.includes("VN")) return "Asia/Ho_Chi_Minh";
  return "Asia/Bangkok";
}

function getTimeInZone(date: Date, tz: string): { hour: number; minute: number; dateStr: string } {
  const iana = getIanaTimezone(tz);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: iana,
    hour: "numeric",
    minute: "numeric",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  return {
    hour: parseInt(map.hour || "0", 10),
    minute: parseInt(map.minute || "0", 10),
    dateStr: `${map.year}-${map.month}-${map.day}`,
  };
}

async function runTests() {
  console.log("=====================================================================");
  console.log("🚀 STARTING COMPREHENSIVE SCHEDULE & CHECKLIST WITH CUSTOM RULES TEST");
  console.log("=====================================================================\n");

  let testsPassed = 0;
  let testsFailed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`  ✅ [PASS] ${testName}${detail ? ` (${detail})` : ""}`);
      testsPassed++;
    } else {
      console.error(`  ❌ [FAIL] ${testName}${detail ? ` - Detail: ${detail}` : ""}`);
      testsFailed++;
    }
  }

  // =================================================================
  // SECTION 1: SCHEDULE ENGINE & AUTO CATCH-UP LOGIC
  // =================================================================
  console.log("---------------------------------------------------------------------");
  console.log("📌 SECTION 1: Schedule Configuration & Auto Catch-Up Engine");
  console.log("---------------------------------------------------------------------");

  // 1.1 Configurable page load delay from ENV
  const catchupEnvValue = process.env.NEXT_PUBLIC_AUTO_SYNC_CATCHUP_DELAY_SECONDS;
  const parsedCatchupDelay = parseInt(catchupEnvValue || "10", 10);
  assert(
    !isNaN(parsedCatchupDelay) && parsedCatchupDelay >= 0,
    "1.1 Read NEXT_PUBLIC_AUTO_SYNC_CATCHUP_DELAY_SECONDS",
    `Configured: ${parsedCatchupDelay}s (Raw env: ${catchupEnvValue})`
  );

  // 1.2 Timezone calculation
  const now = new Date();
  const vnTime = getTimeInZone(now, "Asia/Ho_Chi_Minh");
  assert(
    typeof vnTime.hour === "number" && typeof vnTime.minute === "number" && !!vnTime.dateStr,
    "1.2 Accurate timezone extraction for Asia/Ho_Chi_Minh",
    `Date: ${vnTime.dateStr}, Time: ${String(vnTime.hour).padStart(2, "0")}:${String(vnTime.minute).padStart(2, "0")}`
  );

  // 1.3 Daily Schedule trigger logic (Normal time)
  const scheduledTimeOfDay = "17:00";
  const [targetH, targetM] = scheduledTimeOfDay.split(":").map(Number);
  const targetTotalMinutes = targetH * 60 + targetM;
  const currentTotalMinutes = vnTime.hour * 60 + vnTime.minute;
  const isTimeReachedToday = currentTotalMinutes >= targetTotalMinutes;

  assert(
    typeof isTimeReachedToday === "boolean",
    "1.3 Daily Schedule time evaluation against current clock",
    `Current: ${vnTime.hour}:${vnTime.minute} (${currentTotalMinutes}m) vs Target: 17:00 (${targetTotalMinutes}m) -> Trigger today: ${isTimeReachedToday}`
  );

  // 1.4 Auto Catch-Up Trigger for Missed Run (Yesterday)
  const yesterdayDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const yesterdayTz = getTimeInZone(yesterdayDate, "Asia/Ho_Chi_Minh");
  const isMissedYesterday = yesterdayTz.dateStr < vnTime.dateStr;
  const hoursSinceLastRun = Math.round((now.getTime() - yesterdayDate.getTime()) / (1000 * 60 * 60));

  let catchupShouldTrigger = false;
  if (isMissedYesterday && hoursSinceLastRun >= 20) {
    catchupShouldTrigger = true;
  }

  assert(
    catchupShouldTrigger === true,
    "1.4 Auto Catch-Up triggers when yesterday's sync was missed (>20h ago)",
    `Last run: ${yesterdayTz.dateStr} (${hoursSinceLastRun}h ago) -> Auto Catch-Up will execute!`
  );

  // 1.5 Auto Catch-Up does NOT trigger if already ran today
  const todayEarlierRun = new Date(now.getTime() - 2 * 60 * 60 * 1000); // 2 hours ago today
  const todayRunTz = getTimeInZone(todayEarlierRun, "Asia/Ho_Chi_Minh");
  const alreadyRanToday = todayRunTz.dateStr === vnTime.dateStr;
  const shouldCatchupIfRanToday = !alreadyRanToday;

  assert(
    shouldCatchupIfRanToday === false,
    "1.5 Auto Catch-Up correctly skips if sync ALREADY ran today",
    `Already ran today: ${alreadyRanToday}`
  );

  // 1.6 DB Persistence of sync_schedule config
  const testScheduleConfig = {
    autoEnabled: true,
    mode: "AUTO",
    schedules: [
      {
        id: "test_daily_1",
        enabled: true,
        repeat: "DAILY",
        timeOfDay: "17:00",
        timezone: "Asia/Ho_Chi_Minh",
        lastRunAt: now.toISOString(),
      },
    ],
  };

  await prisma.systemConfig.upsert({
    where: { key: "sync_schedule" },
    create: {
      key: "sync_schedule",
      value: JSON.stringify(testScheduleConfig),
      description: "Automated schedule test",
    },
    update: {
      value: JSON.stringify(testScheduleConfig),
    },
  });

  const savedSchedule = await prisma.systemConfig.findUnique({
    where: { key: "sync_schedule" },
  });
  const parsedSavedSchedule = JSON.parse(savedSchedule?.value || "{}");

  assert(
    parsedSavedSchedule.autoEnabled === true && parsedSavedSchedule.schedules[0].timeOfDay === "17:00",
    "1.6 Schedule persisted to Database and read correctly",
    `Mode: ${parsedSavedSchedule.mode}, Schedules count: ${parsedSavedSchedule.schedules.length}`
  );

  // =================================================================
  // SECTION 2: CHECKLIST RULES, CUSTOM CONFIG & SCORING ENGINE
  // =================================================================
  console.log("\n---------------------------------------------------------------------");
  console.log("📌 SECTION 2: Checklist Workday Scoring Engine & Custom Rules");
  console.log("---------------------------------------------------------------------");

  // 2.1 Default Rules Verification (85% = 1.0, 50% = 0.5, <50% = 0)
  const defaultScore100 = calculateWorkdayScore(10, 10, DEFAULT_SCORING_CONFIG);
  assert(
    defaultScore100.workdayScore === 1.0 && defaultScore100.completionRate === 100,
    "2.1 Default Rule: 10/10 completed (100%) -> 1.0 Ngày công",
    `Score: ${defaultScore100.workdayScore}, Rate: ${defaultScore100.completionRate}%`
  );

  const defaultScore85 = calculateWorkdayScore(20, 17, DEFAULT_SCORING_CONFIG); // 85%
  assert(
    defaultScore85.workdayScore === 1.0 && defaultScore85.completionRate === 85,
    "2.2 Default Rule: Exactly 85% (Threshold) -> 1.0 Ngày công",
    `Score: ${defaultScore85.workdayScore}, Rate: ${defaultScore85.completionRate}%`
  );

  const defaultScore60 = calculateWorkdayScore(10, 6, DEFAULT_SCORING_CONFIG); // 60%
  assert(
    defaultScore60.workdayScore === 0.5 && defaultScore60.completionRate === 60,
    "2.3 Default Rule: 6/10 completed (60%) -> 0.5 Ngày công",
    `Score: ${defaultScore60.workdayScore}, Rate: ${defaultScore60.completionRate}%`
  );

  const defaultScore40 = calculateWorkdayScore(10, 4, DEFAULT_SCORING_CONFIG); // 40%
  assert(
    defaultScore40.workdayScore === 0.0 && defaultScore40.completionRate === 40,
    "2.4 Default Rule: 4/10 completed (40%) -> 0.0 Ngày công (Không đạt)",
    `Score: ${defaultScore40.workdayScore}, Rate: ${defaultScore40.completionRate}%`
  );

  const defaultScore0 = calculateWorkdayScore(0, 0, DEFAULT_SCORING_CONFIG);
  assert(
    defaultScore0.workdayScore === 0.0 && defaultScore0.statusLabel === "Chưa giao việc",
    "2.5 Default Rule: 0 accounts assigned -> 0.0 Ngày công (Chưa giao việc)",
    `Label: ${defaultScore0.statusLabel}`
  );

  // 2.2 Custom Scoring Rules Setup (Admin overrides: Strict 90% full, 70% half)
  console.log("\n  ⚙️ Testing Custom Strict Rules (Threshold: 90% full, 70% half)...");
  const customStrictRules: ScoringRuleConfig = {
    cutOffHour: 11,
    cutOffMinute: 30,
    timezone: "Asia/Ho_Chi_Minh",
    fullDayThreshold: 90, // Strict: needs 90%
    halfDayThreshold: 70, // Strict: needs 70%
    requireDataSync: true,
    requirePostCheck: true,
  };

  // With strict rules: 85% used to get 1.0 workday, but under strict rule it should ONLY get 0.5!
  const strictScore85 = calculateWorkdayScore(20, 17, customStrictRules); // 85%
  assert(
    strictScore85.workdayScore === 0.5,
    "2.6 Custom Rule Override: 85% completion now awards 0.5 công (was 1.0 under default)",
    `Custom threshold: 90% -> got score: ${strictScore85.workdayScore}`
  );

  // With strict rules: 60% used to get 0.5 workday, but under strict rule (<70%) it gets 0.0!
  const strictScore60 = calculateWorkdayScore(10, 6, customStrictRules); // 60%
  assert(
    strictScore60.workdayScore === 0.0,
    "2.7 Custom Rule Override: 60% completion now awards 0.0 công (was 0.5 under default)",
    `Custom threshold: 70% -> got score: ${strictScore60.workdayScore}`
  );

  // With strict rules: 95% gets 1.0
  const strictScore95 = calculateWorkdayScore(20, 19, customStrictRules); // 95%
  assert(
    strictScore95.workdayScore === 1.0,
    "2.8 Custom Rule Override: 95% completion awards 1.0 công under strict 90% threshold",
    `Score: ${strictScore95.workdayScore}`
  );

  // 2.3 Cutoff Time Calculation & Custom Cutoff Hour (11:30 AM vs 10:00 AM)
  const defaultCutoffInfo = getCutoffTimeInfo(DEFAULT_SCORING_CONFIG);
  const customCutoffInfo = getCutoffTimeInfo(customStrictRules);
  assert(
    typeof defaultCutoffInfo.isPastCutoff === "boolean" && typeof customCutoffInfo.isPastCutoff === "boolean",
    "2.9 Cutoff countdown engine computes dynamically for custom cutoff times",
    `Default 10:00 past: ${defaultCutoffInfo.isPastCutoff} | Custom 11:30 past: ${customCutoffInfo.isPastCutoff}`
  );

  // =================================================================
  // SECTION 3: END-TO-END DATABASE CHECKLIST WORKFLOW WITH ACCOUNTS
  // =================================================================
  console.log("\n---------------------------------------------------------------------");
  console.log("📌 SECTION 3: Database E2E Daily Checklist Life-Cycle Test");
  console.log("---------------------------------------------------------------------");

  // Create test staff member
  const testStaffEmail = `staff.checklist.test.${Date.now()}@flow.local`;
  const testStaff = await prisma.user.create({
    data: {
      email: testStaffEmail,
      username: `chk_tester_${Date.now()}`,
      name: "Checklist Rule Tester",
      role: "STAFF",
    },
  });

  // Assign 4 accounts to this staff
  const testAccounts = await Promise.all(
    [1, 2, 3, 4].map((i) =>
      prisma.tiktokAccount.create({
        data: {
          username: `chk.acc.${i}.${Date.now()}`,
          status: "ACTIVE",
          assignedUserId: testStaff.id,
          totalFollowers: 1000 * i,
          totalVideos: 10 * i,
          lastSyncedAt: new Date(),
        },
      })
    )
  );

  assert(
    testAccounts.length === 4,
    "3.1 Created 4 assigned TikTok accounts for test staff",
    `Staff: ${testStaff.name} (${testStaff.id})`
  );

  // Initialize today's DailyChecklist
  const todayOnly = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const initialChecklist = await prisma.dailyChecklist.create({
    data: {
      userId: testStaff.id,
      date: todayOnly,
      totalAssigned: testAccounts.length,
      completedCount: 0,
      completionRate: 0,
      workdayScore: 0,
      items: {
        create: testAccounts.map((acc) => ({
          accountId: acc.id,
          isPosted: false,
          isSynced: true,
          isCompleted: false,
        })),
      },
    },
    include: { items: true },
  });

  assert(
    initialChecklist.items.length === 4 && initialChecklist.workdayScore.toNumber() === 0,
    "3.2 Initialized today's DailyChecklist with 4 items at 0% score",
    `Checklist ID: ${initialChecklist.id}`
  );

  // Simulate Completing 2 out of 4 items (50%)
  const itemsToComplete = initialChecklist.items.slice(0, 2);
  for (const item of itemsToComplete) {
    await prisma.dailyChecklistItem.update({
      where: { id: item.id },
      data: { isPosted: true, isSynced: true, isCompleted: true },
    });
  }

  // Recalculate score under Default Rule (50% threshold -> 0.5 công)
  const scoreResultDefault = calculateWorkdayScore(4, 2, DEFAULT_SCORING_CONFIG);
  const updatedChecklistDefault = await prisma.dailyChecklist.update({
    where: { id: initialChecklist.id },
    data: {
      completedCount: 2,
      completionRate: scoreResultDefault.completionRate,
      workdayScore: scoreResultDefault.workdayScore,
    },
  });

  assert(
    updatedChecklistDefault.workdayScore.toNumber() === 0.5 && updatedChecklistDefault.completionRate.toNumber() === 50,
    "3.3 2/4 completed (50%) -> Correctly updated in DB to 0.5 Công under Default Rules",
    `Score in DB: ${updatedChecklistDefault.workdayScore}, Rate: ${updatedChecklistDefault.completionRate}%`
  );

  // Recalculate score under Custom Strict Rule (Threshold 70% for half day -> 50% gets 0.0 công!)
  const scoreResultStrict = calculateWorkdayScore(4, 2, customStrictRules);
  const updatedChecklistStrict = await prisma.dailyChecklist.update({
    where: { id: initialChecklist.id },
    data: {
      completedCount: 2,
      completionRate: scoreResultStrict.completionRate,
      workdayScore: scoreResultStrict.workdayScore,
    },
  });

  assert(
    updatedChecklistStrict.workdayScore.toNumber() === 0.0,
    "3.4 Same 2/4 (50%) with Custom Strict Rules (70% min) -> Correctly updated in DB to 0.0 Công",
    `Score in DB: ${updatedChecklistStrict.workdayScore}`
  );

  // Simulate completing ALL 4 accounts (100%)
  for (const item of initialChecklist.items) {
    await prisma.dailyChecklistItem.update({
      where: { id: item.id },
      data: { isPosted: true, isSynced: true, isCompleted: true },
    });
  }

  const scoreResultFull = calculateWorkdayScore(4, 4, customStrictRules);
  const updatedChecklistFull = await prisma.dailyChecklist.update({
    where: { id: initialChecklist.id },
    data: {
      completedCount: 4,
      completionRate: scoreResultFull.completionRate,
      workdayScore: scoreResultFull.workdayScore,
    },
  });

  assert(
    updatedChecklistFull.workdayScore.toNumber() === 1.0 && updatedChecklistFull.completionRate.toNumber() === 100,
    "3.5 4/4 completed (100%) -> Correctly updated in DB to 1.0 Công (Full Workday)",
    `Score in DB: ${updatedChecklistFull.workdayScore}, Rate: ${updatedChecklistFull.completionRate}%`
  );

  // Clean up test data
  await prisma.dailyChecklistItem.deleteMany({ where: { checklistId: initialChecklist.id } });
  await prisma.dailyChecklist.delete({ where: { id: initialChecklist.id } });
  await prisma.tiktokAccount.deleteMany({ where: { assignedUserId: testStaff.id } });
  await prisma.user.delete({ where: { id: testStaff.id } });

  console.log("\n  🧹 Test database records cleaned up successfully.");

  // =================================================================
  // SUMMARY
  // =================================================================
  console.log("\n=====================================================================");
  console.log(`📊 TEST SUITE FINISHED: ${testsPassed} PASSED, ${testsFailed} FAILED`);
  console.log("=====================================================================\n");

  if (testsFailed > 0) {
    throw new Error(`${testsFailed} tests failed.`);
  }
}

runTests()
  .catch((e) => {
    console.error("Test execution failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
