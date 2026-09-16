import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { appRouter } from "../src/trpc/root";
import {
  convertCurrency,
  formatRevenue,
  getOrSyncExchangeRates,
  DEFAULT_EXCHANGE_RATES,
} from "../src/lib/currency";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";

async function runTests() {
  console.log("===============================================================");
  console.log("🚀 STARTING COMPREHENSIVE TEST SUITE: BACKEND, AGENT & EXTENSION");
  console.log("===============================================================\n");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, desc: string) {
    if (condition) {
      console.log(`  ✅ PASS: ${desc}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${desc}`);
      failed++;
    }
  }

  // ---------------------------------------------------------------------------
  // TEST SUITE 1: Multi-Currency & Exchange Rates Engine
  // ---------------------------------------------------------------------------
  console.log("📌 1. TESTING MULTI-CURRENCY & EXCHANGE RATE CONVERTER");
  try {
    const rates = await getOrSyncExchangeRates(prisma);
    assert(rates.USD_VND >= 20000, `Live or cached USD_VND rate is valid: ${rates.USD_VND}`);
    assert(rates.GBP_USD >= 1.0, `Live or cached GBP_USD rate is valid: ${rates.GBP_USD}`);
    assert(rates.EUR_USD >= 0.9, `Live or cached EUR_USD rate is valid: ${rates.EUR_USD}`);

    // USD to USD
    const usdToUsd = convertCurrency(100, "USD", "USD", rates);
    assert(Math.abs(usdToUsd - 100) < 0.01, "USD -> USD conversion equals input (100 -> 100)");

    // USD to VND
    const usdToVnd = convertCurrency(100, "USD", "VND", rates);
    assert(usdToVnd === 100 * rates.USD_VND, `USD -> VND matches rate: ${usdToVnd} VND`);

    // GBP to USD
    const gbpToUsd = convertCurrency(100, "GBP", "USD", rates);
    assert(Math.abs(gbpToUsd - 100 * rates.GBP_USD) < 0.01, `GBP -> USD matches: ${gbpToUsd}`);

    // GBP to VND
    const gbpToVnd = convertCurrency(100, "GBP", "VND", rates);
    assert(Math.abs(gbpToVnd - Math.round(100 * rates.GBP_USD * rates.USD_VND)) < 2, `GBP -> VND matches: ${gbpToVnd}`);

    // USD to GBP
    const usdToGbp = convertCurrency(100, "USD", "GBP", rates);
    assert(Math.abs(usdToGbp - 100 / rates.GBP_USD) < 0.05, `USD -> GBP matches: £${usdToGbp}`);

    // USD to EUR
    const usdToEur = convertCurrency(100, "USD", "EUR", rates);
    assert(Math.abs(usdToEur - 100 / rates.EUR_USD) < 0.05, `USD -> EUR matches: €${usdToEur}`);

    // Global 160+ currency dynamic conversion: CAD to USD
    const cadToUsd = convertCurrency(100, "CAD", "USD", rates);
    assert(cadToUsd > 60 && cadToUsd < 85, `160+ dynamic currency CAD -> USD converts correctly: $${cadToUsd}`);

    // Format tests
    const formattedUsd = formatRevenue(123.456, "USD", "USD", { rates });
    assert(formattedUsd === "$123.46", `Format USD with symbol: ${formattedUsd}`);

    const formattedVnd = formatRevenue(100, "USD", "VND", { rates });
    assert(formattedVnd.includes("₫") && (formattedVnd.includes(rates.USD_VND.toLocaleString("vi-VN")) || formattedVnd.includes((100 * rates.USD_VND).toLocaleString("vi-VN"))), `Format VND with symbol: ${formattedVnd}`);

    const formattedGbp = formatRevenue(100, "USD", "GBP", { rates });
    assert(formattedGbp.startsWith("£"), `Format GBP with symbol: ${formattedGbp}`);

    const formattedEur = formatRevenue(100, "USD", "EUR", { rates });
    assert(formattedEur.startsWith("€"), `Format EUR with symbol: ${formattedEur}`);
  } catch (err: any) {
    console.error("  ❌ Currency engine failed:", err.message);
    failed++;
  }

  // ---------------------------------------------------------------------------
  // TEST SUITE 2: Single Source of Truth in AccountAnalytics
  // ---------------------------------------------------------------------------
  console.log("\n📌 2. TESTING SINGLE SOURCE OF TRUTH (AccountAnalytics.rawSnapshot)");
  try {
    // Find or create test account
    let testAccount = await prisma.tiktokAccount.findFirst({
      where: { username: "automated_test_channel" },
    });

    if (!testAccount) {
      testAccount = await prisma.tiktokAccount.create({
        data: {
          username: "automated_test_channel",
          country: "UK",
          groupName: "Test Fleet",
          status: "ACTIVE",
        },
      });
    }

    assert(!!testAccount, `Test account ready: @${testAccount.username} (${testAccount.id})`);

    // Target test date in VN Time (UTC+7): today
    const now = new Date();
    const vnDateStr = now.toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }); // YYYY-MM-DD
    const nowUnixSec = Math.floor(now.getTime() / 1000);

    const mockVideosList = [
      {
        id: "7345678901234567890",
        desc: "Automated test video posted today in VN timezone #tiktok",
        createTime: nowUnixSec,
        views: 15420,
        likes: 2130,
        comments: 48,
        shares: 12,
        duration: 45,
        cover: "https://p16-sign-va.tiktokcdn.com/test-cover.jpeg",
      },
      {
        id: "7345678901234567891",
        desc: "Older video from last week #trending",
        createTime: nowUnixSec - 86400 * 5,
        views: 89000,
        likes: 9500,
        comments: 210,
        shares: 55,
        duration: 60,
        cover: "https://p16-sign-va.tiktokcdn.com/older-cover.jpeg",
      },
    ];

    const mockSnapshot = {
      username: testAccount.username,
      updatedAt: new Date().toISOString(),
      keyMetrics: {
        videoViews: 104420,
        likes: 11630,
        comments: 258,
        shares: 67,
        estRewards: 345.8,
      },
      viewsBreakdown: {
        viewsToday: 15420,
        views7d: 104420,
        totalViews: 104420,
      },
      revenueBreakdown: {
        totalRevenue: 345.8,
        currency: "GBP",
        rpm: 3.31,
      },
      videosList: mockVideosList,
    };

    // Upsert into AccountAnalytics
    const savedAnalytics = await prisma.accountAnalytics.upsert({
      where: { accountId: testAccount.id },
      create: {
        accountId: testAccount.id,
        currency: "GBP",
        totalRevenue: 345.8,
        revenue7d: 345.8,
        revenue28d: 345.8,
        revenue60d: 345.8,
        revenue365d: 345.8,
        views7d: BigInt(104420),
        views28d: BigInt(104420),
        views60d: BigInt(104420),
        views365d: BigInt(104420),
        likes28d: 11630,
        comments28d: 258,
        shares28d: 67,
        rawSnapshot: mockSnapshot as any,
      },
      update: {
        currency: "GBP",
        totalRevenue: 345.8,
        revenue7d: 345.8,
        revenue28d: 345.8,
        rawSnapshot: mockSnapshot as any,
      },
    });

    assert(savedAnalytics.currency === "GBP", "AccountAnalytics currency stored in original GBP");
    assert(Number(savedAnalytics.totalRevenue) === 345.8, "AccountAnalytics totalRevenue stored accurately (345.8)");
    assert(!!savedAnalytics.rawSnapshot, "AccountAnalytics rawSnapshot persisted");
    const rawSnap = savedAnalytics.rawSnapshot as any;
    assert(rawSnap.videosList?.length === 2, `rawSnapshot.videosList contains ${rawSnap.videosList?.length} videos`);

    // ---------------------------------------------------------------------------
    // TEST SUITE 3: tRPC checklist.getAccountVideos (Date Matching in VN Time)
    // ---------------------------------------------------------------------------
    console.log("\n📌 3. TESTING tRPC checklist.getAccountVideos WITH VN TIMEZONE");
    const adminUser = await prisma.user.findFirst({ where: { role: "ADMIN" } });
    const caller = appRouter.createCaller({
      prisma,
      session: {
        user: {
          id: adminUser?.id || "admin-test-id",
          role: "ADMIN",
          name: "Admin Tester",
          username: "admin",
        } as any,
        expires: new Date(Date.now() + 86400000).toISOString(),
      },
    });

    const videoResult = await caller.checklist.getAccountVideos({
      username: testAccount.username,
      accountId: testAccount.id,
      date: vnDateStr,
    });

    assert(!!videoResult.account, "checklist.getAccountVideos returns account data");
    assert(videoResult.totalVideosCount === 2, `Total videos count matches snapshot (2)`);
    assert(videoResult.targetDateVideos.length === 1, `Target date (${vnDateStr}) matched exactly 1 video`);
    assert(videoResult.targetDateVideos[0].views === 15420, "Video views match extracted metrics (15,420)");
    assert(videoResult.targetDateVideos[0].likes === 2130, "Video likes match extracted metrics (2,130)");
    assert(
      videoResult.targetDateVideos[0].tiktokUrl?.includes("tiktok.com/@automated_test_channel/video/7345678901234567890"),
      `Generated canonical TikTok video URL: ${videoResult.targetDateVideos[0].tiktokUrl}`
    );
    assert(videoResult.otherRecentVideos.length === 1, "otherRecentVideos partitions non-target dates cleanly");
  } catch (err: any) {
    console.error("  ❌ SSOT / Checklist test failed:", err.message);
    failed++;
  }

  // ---------------------------------------------------------------------------
  // TEST SUITE 4: Client Agent & Extension Syntax & Package Files
  // ---------------------------------------------------------------------------
  console.log("\n📌 4. TESTING CLIENT AGENT & EXTENSION CODE INTEGRITY");
  try {
    // 4.1 Extension files
    const manifestPath = path.join(process.cwd(), "extension", "manifest.json");
    assert(fs.existsSync(manifestPath), "extension/manifest.json exists");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    assert(manifest.manifest_version === 3, "Manifest version is 3 (MV3 compliant)");
    assert(manifest.name.includes("TikTok"), "Manifest name is valid");

    // Check JavaScript syntax
    execSync("node -c extension/background.js");
    console.log("  ✅ PASS: extension/background.js syntax check passed");
    passed++;

    execSync("node -c extension/content.js");
    console.log("  ✅ PASS: extension/content.js syntax check passed");
    passed++;

    execSync("node -c extension/popup.js");
    console.log("  ✅ PASS: extension/popup.js syntax check passed");
    passed++;

    // 4.2 Client Agent
    const agentJsPath = path.join(process.cwd(), "client-agent", "agent.js");
    assert(fs.existsSync(agentJsPath), "client-agent/agent.js exists");
    execSync("node -c client-agent/agent.js");
    console.log("  ✅ PASS: client-agent/agent.js syntax check passed");
    passed++;

    const agentPackagePath = path.join(process.cwd(), "client-agent", "package.json");
    assert(fs.existsSync(agentPackagePath), "client-agent/package.json exists");

    const nodeExePath = path.join(process.cwd(), "client-agent", "bin", "node.exe");
    assert(fs.existsSync(nodeExePath), "client-agent/bin/node.exe exists for standalone execution");

    const nssmExePath = path.join(process.cwd(), "client-agent", "bin", "nssm.exe");
    assert(fs.existsSync(nssmExePath), "client-agent/bin/nssm.exe exists for Windows Service daemon");
  } catch (err: any) {
    console.error("  ❌ Client Agent / Extension integrity test failed:", err.message);
    failed++;
  }

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  console.log("\n===============================================================");
  console.log(`📊 TEST SUITE SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log("===============================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((e) => {
  console.error("Fatal test runner error:", e);
  process.exit(1);
});
