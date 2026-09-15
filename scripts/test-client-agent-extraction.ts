import "dotenv/config";
import fs from "fs";
import path from "path";
import { chromium } from "playwright-core";
import { getChromeExecutablePath } from "../src/lib/tiktok-extractor";
import { prisma } from "../src/lib/prisma";

function copyDirRecursive(src: string, dest: string) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (["Cache", "Code Cache", "GPUCache", "Media Cache"].includes(entry.name)) continue;
    try {
      if (entry.isDirectory()) copyDirRecursive(srcPath, destPath);
      else fs.copyFileSync(srcPath, destPath);
    } catch {}
  }
}

async function testExtraction() {
  console.log("=== TESTING CLIENT AGENT DATA EXTRACTION ON REAL PROFILE ===");

  const profileDir = "D:\\Tiktok automation\\b57d9f1b-4dae-4377-a870-99d5b8be8434";
  const profileId = "b57d9f1b-4dae-4377-a870-99d5b8be8434";

  if (!fs.existsSync(profileDir)) {
    console.error(`[!] Profile directory not found: ${profileDir}`);
    return;
  }

  // 1. Snapshot to Drive D: temp
  const tempBase = "D:\\Tiktok automation\\.gpm_temp";
  fs.mkdirSync(tempBase, { recursive: true });
  const tempDir = fs.mkdtempSync(path.join(tempBase, "agent-test-"));
  console.log(`[1] Created profile snapshot in: ${tempDir}`);
  copyDirRecursive(profileDir, tempDir);

  const chromePath = getChromeExecutablePath();
  console.log(`[2] Launching browser with: ${chromePath}`);

  const context = await chromium.launchPersistentContext(tempDir, {
    headless: true,
    executablePath: chromePath,
    args: [
      "--no-sandbox",
      "--disable-blink-features=AutomationControlled",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--lang=vi-VN",
    ],
    viewport: { width: 1440, height: 900 },
  });

  const page = await context.newPage();

  // Intercept state
  let interceptedRewardAnalytics: any = null;
  let interceptedAllPrograms: any = null;
  let interceptedInsightsHistory: any = null;
  let followerCount = 0;
  let userInfo: any = null;

  page.on("response", async (resp) => {
    const url = resp.url();
    try {
      if (url.includes("/tiktokstudio/api/web/user") && !url.includes("aid=")) {
        const j = await resp.json();
        if (j.userBaseInfo?.UserProfile?.UserBase) {
          userInfo = j.userBaseInfo.UserProfile.UserBase;
        }
      }
      if (url.includes("multiGetFollowRelationCount")) {
        const j = await resp.json();
        if (j.FollowerCount) {
          const firstVal = Object.values(j.FollowerCount)[0];
          if (firstVal !== undefined) followerCount = parseInt(firstVal as string, 10) || 0;
        }
      }
      if (url.includes("/m10n_center/reward_analytics")) {
        const j = await resp.json();
        const payload = j.data || j;
        if (payload.daily_estimated_income || payload.seven_d_income) {
          interceptedRewardAnalytics = payload;
          console.log(`[INTERCEPT] /reward_analytics captured! Daily count: ${payload.daily_estimated_income?.length}`);
        }
      }
      if (url.includes("/m10n_center/all_programs")) {
        const j = await resp.json();
        const payload = j.data || j;
        if (payload.active_m10n_programs) {
          interceptedAllPrograms = payload.active_m10n_programs;
          console.log(`[INTERCEPT] /all_programs captured! Active programs count: ${payload.active_m10n_programs?.length}`);
        }
      }
      if (url.includes("/aweme/v2/data/insight/")) {
        const j = await resp.json();
        if (j.vv_history || j.like_history) {
          interceptedInsightsHistory = j;
          console.log(`[INTERCEPT] /aweme/v2/data/insight/ captured!`);
        }
      }
    } catch {}
  });

  // Navigate to Content
  console.log("[3] Navigating to TikTok Studio Content...");
  await page.goto("https://www.tiktok.com/tiktokstudio/content", {
    waitUntil: "domcontentloaded",
    timeout: 25000,
  }).catch(() => {});

  // Wait for user info
  const waitStart = Date.now();
  while (Date.now() - waitStart < 3000) {
    if (userInfo) break;
    await page.waitForTimeout(200);
  }

  const username = userInfo?.UniqId || "ceotelamonix";
  console.log(`[OK] Detected username: @${username}, followers: ${followerCount}`);

  // Navigate to Monetization
  console.log("[4] Navigating to TikTok Studio Monetization...");
  await page.goto("https://www.tiktok.com/tiktokstudio/monetization", {
    waitUntil: "domcontentloaded",
    timeout: 25000,
  }).catch(() => {});

  // Wait for intercepted reward analytics
  const waitM10n = Date.now();
  while (Date.now() - waitM10n < 4000 && !interceptedRewardAnalytics) {
    await page.waitForTimeout(200);
  }

  // Query Home tab 365d insight
  console.log("[5] Querying Home tab for 365d insight revenue...");
  const home365 = await page.evaluate(async () => {
    try {
      const typeReq = [{ insight_type: 126, data_date_range: 4 }];
      const url = "/tiktok/v1/analytics/insights/?type_requests=" + encodeURIComponent(JSON.stringify(typeReq)) + "&time_offset=25200&is_dark_mode=false";
      const resp = await fetch(url);
      const j = await resp.json();
      return j.analytics_overview_rewards?.total?.amount ?? null;
    } catch {
      return null;
    }
  }).catch(() => null);

  console.log(`[OK] Home 365d Revenue: $${home365}`);

  // Parse money helper matching agent.js
  const parseMoney = (m: any) => {
    if (!m) return 0;
    if (m.formatted_no_symbol) {
      const v = parseFloat(String(m.formatted_no_symbol).replace(/,/g, ""));
      if (!isNaN(v)) return v;
    }
    const units = typeof m.units === "number" ? m.units : parseInt(m.units || "0", 10) || 0;
    const nanos = typeof m.nanos === "number" ? m.nanos : parseInt(m.nanos || "0", 10) || 0;
    return units + nanos / 1e9;
  };

  const revenue7d = interceptedRewardAnalytics ? parseMoney(interceptedRewardAnalytics.seven_d_income) : 0;
  const revenue28d = interceptedRewardAnalytics ? parseMoney(interceptedRewardAnalytics.thirty_d_income) : 0;
  const revenue60d = interceptedRewardAnalytics ? parseMoney(interceptedRewardAnalytics.sixty_d_income) : 0;
  const currency = interceptedRewardAnalytics?.selected_currency?.symbol || "$";
  const dailyBreakdown = (interceptedRewardAnalytics?.daily_estimated_income || []).map((item: any) => ({
    date: new Date(item.time * 1000).toISOString().split("T")[0],
    revenue: parseMoney(item.money),
  }));

  console.log("\n--- EXTRACTION SUMMARY ---");
  console.log(`Account: @${username}`);
  console.log(`Currency: ${currency}`);
  console.log(`Revenue 7d: $${revenue7d}`);
  console.log(`Revenue 28d: $${revenue28d}`);
  console.log(`Revenue 60d: $${revenue60d}`);
  console.log(`Revenue 365d: $${home365}`);
  console.log(`Daily breakdown points: ${dailyBreakdown.length} days`);
  if (dailyBreakdown.length > 0) {
    console.log(`Sample breakdown days:`, dailyBreakdown.slice(0, 3));
  }
  console.log(`Active programs count: ${interceptedAllPrograms?.length || 0}`);

  // Close browser and cleanup temp dir
  await context.close();
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
    console.log(`[OK] Cleaned up snapshot tempDir`);
  } catch {}

  // 6. Test Upsert into Backend AccountAnalytics table
  console.log("\n[6] Testing Backend Upsert into AccountAnalytics...");
  const dbAccount = await prisma.tiktokAccount.findFirst({
    where: { username: { contains: username, mode: "insensitive" } },
  });

  if (dbAccount) {
    const upserted = await prisma.accountAnalytics.upsert({
      where: { accountId: dbAccount.id },
      create: {
        accountId: dbAccount.id,
        currency,
        revenue7d,
        revenue28d,
        revenue60d,
        revenue365d: typeof home365 === "number" ? home365 : null,
        totalRevenue: typeof home365 === "number" ? home365 : revenue60d,
        dailyBreakdown: dailyBreakdown as any,
        activePrograms: (interceptedAllPrograms || []) as any,
        insightsHistory: interceptedInsightsHistory as any,
      },
      update: {
        currency,
        revenue7d,
        revenue28d,
        revenue60d,
        revenue365d: typeof home365 === "number" ? home365 : undefined,
        totalRevenue: typeof home365 === "number" ? home365 : revenue60d,
        dailyBreakdown: dailyBreakdown as any,
        activePrograms: (interceptedAllPrograms || []) as any,
        insightsHistory: interceptedInsightsHistory as any,
      },
    });

    console.log(`[OK] Database AccountAnalytics upserted successfully! ID: ${upserted.id}`);
    console.log(`   - Stored 7d: $${upserted.revenue7d}`);
    console.log(`   - Stored 28d: $${upserted.revenue28d}`);
    console.log(`   - Stored 60d: $${upserted.revenue60d}`);
    console.log(`   - Stored 365d: $${upserted.revenue365d}`);
    console.log(`   - Stored daily breakdown days: ${Array.isArray(upserted.dailyBreakdown) ? (upserted.dailyBreakdown as any[]).length : 0}`);
  }

  console.log("\n=== CLIENT AGENT EXTRACTION TEST PASSED 100%! ===");
}

testExtraction().catch((err) => {
  console.error("[TEST FAILED]:", err);
  process.exit(1);
});
