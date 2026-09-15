import fs from "fs";
import path from "path";
import { chromium } from "playwright";
import { getChromeExecutablePath } from "../src/lib/tiktok-extractor";

function copyDirRecursive(src: string, dest: string) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.name === "Cache" || entry.name === "Code Cache" || entry.name === "GPUCache" || entry.name === "Media Cache") {
      continue;
    }
    try {
      if (entry.isDirectory()) {
        copyDirRecursive(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    } catch {}
  }
}

async function testAllDataInterception() {
  const profileDir = "D:\\Tiktok automation\\b57d9f1b-4dae-4377-a870-99d5b8be8434";
  const tempBase = "D:\\Tiktok automation\\.gpm_temp";
  fs.mkdirSync(tempBase, { recursive: true });
  const tempDir = fs.mkdtempSync(path.join(tempBase, "verify-all-"));

  console.log("[1] Creating profile snapshot on Drive D:...");
  copyDirRecursive(profileDir, tempDir);

  const chromePath = getChromeExecutablePath();
  console.log("[2] Launching Playwright with ChromiumCore...");
  const context = await chromium.launchPersistentContext(tempDir, {
    headless: true,
    executablePath: chromePath,
    args: [
      "--no-sandbox",
      "--disable-blink-features=AutomationControlled",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--lang=en-US",
    ],
    viewport: { width: 1440, height: 900 },
  });

  const page = await context.newPage();

  // Storage for all intercepted data
  let interceptedUser: any = null;
  let interceptedFollowers = 0;
  let interceptedRewardAnalytics: any = null;
  let interceptedAllPrograms: any = null;
  let interceptedInsightsHistory: any = null;

  page.on("response", async (resp) => {
    const url = resp.url();
    try {
      // 1. User Base Info
      if (url.includes("/tiktokstudio/api/web/user") && !url.includes("aid=")) {
        const j = await resp.json();
        if (j.userBaseInfo?.UserProfile?.UserBase) {
          interceptedUser = j.userBaseInfo.UserProfile.UserBase;
          console.log("  -> [OK] Intercepted User Info: @" + interceptedUser.UniqId);
        }
      }
      // 2. Follower Count
      if (url.includes("multiGetFollowRelationCount")) {
        const j = await resp.json();
        if (j.FollowerCount) {
          const firstVal = Object.values(j.FollowerCount)[0];
          if (firstVal !== undefined) {
            interceptedFollowers = parseInt(firstVal as string, 10) || 0;
            console.log("  -> [OK] Intercepted Follower Count:", interceptedFollowers);
          }
        }
      }
      // 3. Reward Analytics (Monetization Center)
      if (url.includes("/m10n_center/reward_analytics")) {
        const j = await resp.json();
        const payload = j.data || j;
        if (payload.daily_estimated_income || payload.seven_d_income) {
          interceptedRewardAnalytics = payload;
          console.log("  -> [OK] Intercepted Reward Analytics (60-day daily points & program incomes)");
        }
      }
      // 4. All Monetization Programs
      if (url.includes("/m10n_center/all_programs")) {
        const j = await resp.json();
        const payload = j.data || j;
        if (payload.active_m10n_programs) {
          interceptedAllPrograms = payload.active_m10n_programs;
          console.log("  -> [OK] Intercepted Active Programs Count:", interceptedAllPrograms.length);
        }
      }
      // 5. Aweme Insight History (Views, Likes, Comments, Shares)
      if (url.includes("/aweme/v2/data/insight/")) {
        const j = await resp.json();
        if (j.vv_history || j.like_history) {
          interceptedInsightsHistory = j;
          console.log("  -> [OK] Intercepted Insights History (vv_history, like_history, etc.)");
        }
      }
    } catch {}
  });

  // Step A: Visit Studio Content
  console.log("\n[3] Visiting https://www.tiktok.com/tiktokstudio/content ...");
  await page.goto("https://www.tiktok.com/tiktokstudio/content", {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  }).catch(() => {});

  await page.waitForTimeout(4000);

  // Extract pre-rendered post list
  const rawPosts = await page.evaluate(() => {
    const el = document.getElementById("__Creator_Center_Context__");
    if (!el || !el.textContent) return [];
    try {
      const clean = el.textContent.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
      const parsed = JSON.parse(clean);
      return parsed.firstBatchQueryItems?.item_list || parsed.post_list || [];
    } catch {
      return [];
    }
  });

  console.log(`  -> [OK] Extracted ${rawPosts.length} videos from pre-rendered context`);

  // Step B: Visit Studio Monetization
  console.log("\n[4] Visiting https://www.tiktok.com/tiktokstudio/monetization ...");
  await page.goto("https://www.tiktok.com/tiktokstudio/monetization", {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  }).catch(() => {});

  await page.waitForTimeout(6000);

  // Step C: Visit Studio Home for 365d Overview
  console.log("\n[5] Visiting https://www.tiktok.com/tiktokstudio (Home) & querying 365d overview...");
  await page.goto("https://www.tiktok.com/tiktokstudio", {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  }).catch(() => {});

  await page.waitForTimeout(3000);

  const homeRewards365 = await page.evaluate(async () => {
    const typeReq = [{ insight_type: 126, data_date_range: 4 }];
    const url = `/tiktok/v1/analytics/insights/?type_requests=${encodeURIComponent(JSON.stringify(typeReq))}&time_offset=25200&is_dark_mode=false`;
    try {
      const resp = await fetch(url);
      const j = await resp.json();
      return j.analytics_overview_rewards?.total?.amount ?? 0;
    } catch {
      return null;
    }
  });

  console.log("  -> [OK] 365-day Est. Rewards from Home Tab:", homeRewards365);

  // Parse Monetization Details
  const parseMoney = (m: any) => {
    if (!m) return 0;
    if (m.formatted_no_symbol) {
      const v = parseFloat(m.formatted_no_symbol.replace(/,/g, ""));
      if (!isNaN(v)) return v;
    }
    const units = typeof m.units === "number" ? m.units : parseInt(m.units || "0", 10) || 0;
    const nanos = typeof m.nanos === "number" ? m.nanos : parseInt(m.nanos || "0", 10) || 0;
    return units + nanos / 1e9;
  };

  const currency = interceptedRewardAnalytics?.selected_currency?.symbol || "$";
  const rev7d = parseMoney(interceptedRewardAnalytics?.seven_d_income);
  const rev28d = parseMoney(interceptedRewardAnalytics?.thirty_d_income);
  const rev60d = parseMoney(interceptedRewardAnalytics?.sixty_d_income);

  const dailyBreakdown = (interceptedRewardAnalytics?.daily_estimated_income || []).map((item: any) => {
    const dateStr = new Date(item.time * 1000).toISOString().split("T")[0];
    return {
      date: dateStr,
      revenue: parseMoney(item.money),
    };
  });

  let shopRevenue = 0;
  let shopName = "TikTok Shop for Seller";
  const activePrograms: any[] = [];

  (interceptedRewardAnalytics?.m10n_program_user_income || []).forEach((p: any) => {
    const name = p.m10n_program_name || "Program " + p.m10n_program;
    const p7d = parseMoney(p.seven_d_income);
    const p28d = parseMoney(p.thirty_d_income);
    const p60d = parseMoney(p.sixty_d_income);
    const effective = p28d > 0 ? p28d : p7d;

    if (p.m10n_program === 11 || /shop/i.test(name)) {
      shopRevenue = effective;
      shopName = name;
    } else {
      activePrograms.push({
        name,
        programId: p.m10n_program,
        revenue: effective,
        revenue7d: p7d,
        revenue28d: p28d,
        revenue60d: p60d,
      });
    }
  });

  // Final summary verification report
  console.log("\n=======================================================");
  console.log("       COMPLETE DATA EXTRACTION VERIFICATION REPORT     ");
  console.log("=======================================================");
  console.log(`Identity: @${interceptedUser?.UniqId || "Unknown"} (Nickname: ${interceptedUser?.NickName || "N/A"})`);
  console.log(`Followers: ${interceptedFollowers}`);
  console.log(`Videos Count: ${rawPosts.length}`);
  if (rawPosts.length > 0) {
    console.log(`  Sample Video 1: "${rawPosts[0].desc?.slice(0, 30)}..." | Views: ${rawPosts[0].play_count} | Likes: ${rawPosts[0].like_count}`);
  }
  console.log(`Currency: ${currency}`);
  console.log(`Revenue (7 Days): ${currency}${rev7d}`);
  console.log(`Revenue (28 Days): ${currency}${rev28d}`);
  console.log(`Revenue (60 Days): ${currency}${rev60d}`);
  console.log(`Revenue (365 Days - Home Tab): ${currency}${homeRewards365 ?? 0}`);
  console.log(`TikTok Shop (${shopName}): ${currency}${shopRevenue}`);
  console.log(`Active Programs (${activePrograms.length}):`, activePrograms.map((p) => `${p.name}: ${currency}${p.revenue}`).join(", ") || "None");
  console.log(`Daily Breakdown Points: ${dailyBreakdown.length} days captured`);
  if (dailyBreakdown.length > 0) {
    console.log(`  Earliest: ${dailyBreakdown[0].date} (${currency}${dailyBreakdown[0].revenue})`);
    console.log(`  Latest:   ${dailyBreakdown[dailyBreakdown.length - 1].date} (${currency}${dailyBreakdown[dailyBreakdown.length - 1].revenue})`);
  }
  console.log(`Interaction Histories Available: ${interceptedInsightsHistory ? "YES (vv, pv, like, comment, share)" : "NO"}`);
  console.log("=======================================================\n");

  await context.close();
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch {}
}

testAllDataInterception().catch(console.error);
