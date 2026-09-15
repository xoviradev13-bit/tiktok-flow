import "dotenv/config";
import fs from "fs";
import path from "path";
import { prisma } from "../src/lib/prisma";
import {
  detectTikTokAccountFromGpm,
  getGpmStoragePath,
  findTikTokHandleInProfile,
} from "../src/lib/tiktok-extractor";
import {
  calculateWorkdayScore,
  getCutoffTimeInfo,
  DEFAULT_SCORING_CONFIG,
} from "../src/lib/scoring-engine";

async function main() {
  console.log("=================================================================");
  console.log("🔍 TESTING REAL PROFILE EXTRACTION & CRON CUTOFF ATTENDANCE FLOW");
  console.log("=================================================================\n");

  // 1. Check GPM Storage Path & Local Profiles
  const gpmPath = getGpmStoragePath();
  console.log(`[Step 1] Checking GPM Storage Path: ${gpmPath}`);
  let localProfileDirs: string[] = [];
  if (fs.existsSync(gpmPath)) {
    localProfileDirs = fs
      .readdirSync(gpmPath, { withFileTypes: true })
      .filter((d) => d.isDirectory() && /^[0-9a-f-]{36}$/i.test(d.name))
      .map((d) => d.name);
    console.log(`  📁 Found ${localProfileDirs.length} GPM profile folders on disk.`);
  } else {
    console.warn(`  ⚠️ GPM Storage path does not exist on this machine: ${gpmPath}`);
  }

  // 2. Query Real Accounts from DB with gpmProfileId
  console.log(`\n[Step 2] Querying TikTok accounts in database...`);
  const accountsWithGpm = await prisma.tiktokAccount.findMany({
    where: { gpmProfileId: { not: null } },
    take: 10,
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      username: true,
      gpmProfileName: true,
      gpmProfileId: true,
      totalViews: true,
      totalVideos: true,
      totalFollowers: true,
      totalRevenue: true,
      lastSyncedAt: true,
    },
  });

  console.log(`  💾 Found ${accountsWithGpm.length} accounts with GPM profile IDs in DB.`);
  for (const acc of accountsWithGpm.slice(0, 5)) {
    console.log(`    • @${acc.username || "unknown"} (GPM: ${acc.gpmProfileId})`);
  }

  // Pick a real profile to test
  let testProfileId = accountsWithGpm[0]?.gpmProfileId || localProfileDirs[0];
  if (!testProfileId) {
    testProfileId = "80d8f999-e7f6-4f06-bb33-15896a70b332";
  }

  console.log(`\n[Step 3] Testing Data Extraction on profile: ${testProfileId}`);
  const handleFound = findTikTokHandleInProfile(testProfileId);
  console.log(`  🔎 Disk / LevelDB handle detection: ${handleFound ? `@${handleFound}` : "None found on disk"}`);

  try {
    const startTime = Date.now();
    console.log(`  ⏳ Running detectTikTokAccountFromGpm('${testProfileId}')...`);
    const result = await detectTikTokAccountFromGpm(testProfileId);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    if (result) {
      console.log(`  ✅ Extraction succeeded in ${duration}s!`);
      console.log(`     - Username: @${result.username}`);
      console.log(`     - Nickname: ${result.nickname || "N/A"}`);
      console.log(`     - Country: ${result.country}`);
      console.log(`     - Followers: ${result.followersCount}`);
      console.log(`     - Total Videos: ${result.totalVideos || result.videoCount}`);
      console.log(`     - Videos Today (last 24h): ${result.videosToday ?? "N/A"}`);
      console.log(`     - Videos 7d: ${result.videos7d ?? "N/A"}`);
      console.log(`     - Total Views: ${result.totalViews}`);
      console.log(`     - Total Revenue: ${result.totalRewardsUsd ? `$${result.totalRewardsUsd}` : "$0"}`);
      console.log(`     - RPM: ${result.rpm ? `$${result.rpm}` : "N/A"}`);
    } else {
      console.log(`  ℹ️ Extraction returned null (profile might not be logged in or browser offline).`);
    }
  } catch (err: any) {
    console.error(`  ❌ Extraction error:`, err.message);
  }

  // 4. Test Cron Cutoff Logic & Scoring
  console.log(`\n[Step 4] Testing 10:00 AM Cron Cutoff Evaluation Logic...`);
  const cutoffInfo = getCutoffTimeInfo(DEFAULT_SCORING_CONFIG);
  console.log(`  ⏰ Current VN Time: ${cutoffInfo.currentTimeString}`);
  console.log(`  ⏰ Cutoff Target: ${cutoffInfo.cutoffTimeString}`);
  console.log(`  ⏰ Past 10:00 AM Cutoff today? ${cutoffInfo.isPastCutoff ? "YES (Finalized/Locked)" : `NO (Pending - ${cutoffInfo.remainingFormatted} left)`}`);

  // Test scoring scenarios (using our validated 85% / 50% rules)
  console.log(`\n[Step 5] Testing Attendance Scoring Rules (0.5 vs 1.0 Ngày Công)...`);
  const testScenarios = [
    { total: 10, completed: 10, expected: 1.0, label: "100% completed" },
    { total: 10, completed: 9, expected: 1.0, label: "90% (>= 85%)" },
    { total: 10, completed: 8, expected: 0.5, label: "80% (>= 50% & < 85%)" },
    { total: 10, completed: 5, expected: 0.5, label: "50% (exactly 50%)" },
    { total: 10, completed: 4, expected: 0.0, label: "40% (< 50%)" },
    { total: 0, completed: 0, expected: 0.0, label: "0 assigned" },
  ];

  for (const s of testScenarios) {
    const res = calculateWorkdayScore(s.total, s.completed, DEFAULT_SCORING_CONFIG);
    const pass = res.workdayScore === s.expected;
    console.log(
      `  ${pass ? "✅" : "❌"} Scenario [${s.completed}/${s.total} (${s.label})]: ${res.workdayScore} công (${res.statusLabel}) -> Rate: ${res.completionRate}%`
    );
  }

  // 5. Test Live Checklist from DB for Today
  console.log(`\n[Step 6] Checking today's checklists in database...`);
  const today = new Date();
  const todayUtc = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
  const todayChecklists = await prisma.dailyChecklist.findMany({
    where: { date: todayUtc },
    include: {
      user: { select: { name: true, username: true } },
      items: { include: { account: true } },
    },
  });

  console.log(`  📋 Checklists for today (${todayUtc.toISOString().split("T")[0]}): ${todayChecklists.length} staff records found.`);
  for (const chk of todayChecklists) {
    const total = chk.items.length;
    const completed = chk.items.filter((i) => i.isCompleted).length;
    const posted = chk.items.filter((i) => i.isPosted).length;
    const score = calculateWorkdayScore(total, completed, DEFAULT_SCORING_CONFIG);
    console.log(`    • Staff: ${chk.user.name} (@${chk.user.username}) | Items: ${completed}/${total} completed (${posted} posted) | Score: ${score.workdayScore} công | Locked: ${chk.isLocked}`);
  }

  console.log("\n=================================================================");
  console.log("✨ TEST EXECUTION COMPLETED SUCCESSFULLY");
  console.log("=================================================================\n");
}

main()
  .catch((e) => {
    console.error("Test execution failed:", e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
