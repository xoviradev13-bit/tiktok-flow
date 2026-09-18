import path from "path";
import fs from "fs";
import { chromium } from "playwright-core";
import {
  getGpmStoragePath,
  getChromeExecutablePath,
  createMinimalProfileSnapshot,
} from "../client-agent/agent.js";

async function testExactStudioParameters() {
  const profileId = "500a1071-8dd2-43dd-9685-220721b0c4a4";
  const storageRoot = getGpmStoragePath();
  const profileDir = path.join(storageRoot, profileId);
  const chromePath = getChromeExecutablePath();

  const snap = await createMinimalProfileSnapshot(profileDir, profileId);
  const context = await chromium.launchPersistentContext(snap.tempDir, {
    headless: true,
    executablePath: chromePath,
    args: ["--no-sandbox", "--disable-gpu"],
    viewport: { width: 1440, height: 900 },
  });

  const page = await context.newPage();

  await page.goto("https://www.tiktok.com/tiktokstudio", { waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(3000);

  const exactStudioMetrics = await page.evaluate(async () => {
    // 1. Get userId and counter from Studio API
    const userRes = await fetch("/tiktokstudio/api/web/user").then(r => r.json()).catch(() => null);
    const userId = userRes?.userId;
    const country = userRes?.userBaseInfo?.UserProfile?.UserBase?.Region?.RegistrationCountry;

    const counterRes = userId ? await fetch(`/tiktokstudio/api/web/counter/getHashCount?userId=${userId}`).then(r => r.json()).catch(() => null) : null;
    const stats = counterRes?.CountData?.[userId] || {};

    const followRes = userId ? await fetch(`/tiktokstudio/api/web/relation/multiGetFollowRelationCount?userId=${userId}`).then(r => r.json()).catch(() => null) : null;
    const followerCount = followRes?.FollowerCount?.[userId];

    // 2. Fetch insight with end_days: 1 (EXACTLY what Studio UI does!)
    // For 7 days, Studio requests days: 8, end_days: 1
    // For 28 days, Studio requests days: 29, end_days: 1
    // For 60 days, Studio requests days: 61, end_days: 1
    // For 365 days, Studio requests days: 366, end_days: 1
    const ranges = [
      { key: "7d", days: 8, end_days: 1 },
      { key: "28d", days: 29, end_days: 1 },
      { key: "60d", days: 61, end_days: 1 },
      { key: "365d", days: 366, end_days: 1 },
    ];

    const sumMetric = (arr) => (arr || []).reduce((acc, curr) => acc + (curr.value || 0), 0);

    const insightsData = {};
    for (const r of ranges) {
      const typeRequests = [
        { insigh_type: "vv_history", days: r.days, end_days: r.end_days },
        { insigh_type: "pv_history", days: r.days, end_days: r.end_days },
        { insigh_type: "like_history", days: r.days, end_days: r.end_days },
        { insigh_type: "comment_history", days: r.days, end_days: r.end_days },
        { insigh_type: "share_history", days: r.days, end_days: r.end_days },
      ];
      const url = `/aweme/v2/data/insight/?tz_offset=25200&type_requests=${encodeURIComponent(JSON.stringify(typeRequests))}`;
      const res = await fetch(url).then(r => r.json()).catch(() => ({}));
      insightsData[r.key] = {
        views: sumMetric(res.vv_history),
        likes: sumMetric(res.like_history),
        comments: sumMetric(res.comment_history),
        shares: sumMetric(res.share_history),
        profileViews: sumMetric(res.pv_history),
      };
    }

    return {
      userId,
      country,
      followerCount: Number(followerCount) || 0,
      totalLikes: Number(stats.repined_count) || 0,
      totalVideos: Number(stats.item_count) || 0,
      publicVideos: Number(stats.new_friends_see_item_count) || 0,
      privateVideos: Number(stats.private_aweme_count) || 0,
      insightsData,
    };
  });

  console.log("=== EXACT STUDIO API METRICS ===");
  console.log(JSON.stringify(exactStudioMetrics, null, 2));

  await context.close();
  try { fs.rmSync(snap.tempDir, { recursive: true, force: true }); } catch {}
}

testExactStudioParameters().catch(console.error);
