import path from 'path';
import { getGpmStoragePath, getChromeExecutablePath } from '../client-agent/agent.js';
import { chromium } from 'playwright-core';
import fs from 'fs';

function copyDirRecursive(src, dest) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith(".") || entry.name === "lock" || entry.name.endsWith(".lock")) continue;
    if (["Cache", "Code Cache", "GPUCache", "DawnCache"].includes(entry.name)) continue;
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDirRecursive(s, d);
    else try { fs.copyFileSync(s, d); } catch {}
  }
}

async function main() {
  const storagePath = getGpmStoragePath();
  const chromePath = getChromeExecutablePath();
  const profileId = "500a1071-8dd2-43dd-9685-220721b0c4a4";
  const profileDir = path.join(storagePath, profileId);

  const tempRoot = path.join(path.dirname(profileDir), ".gpm_temp");
  fs.mkdirSync(tempRoot, { recursive: true });
  const tempDir = fs.mkdtempSync(path.join(tempRoot, "test-allprog-"));
  copyDirRecursive(profileDir, tempDir);

  const context = await chromium.launchPersistentContext(tempDir, {
    headless: true,
    executablePath: chromePath,
    args: ["--no-sandbox", "--disable-gpu"],
    viewport: { width: 1440, height: 900 },
  });

  const page = await context.newPage();

  console.log("Navigating to item page...");
  await page.goto("https://www.tiktok.com/tiktokstudio/monetization/item/7672354204966456598/", {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  }).catch(() => {});

  await page.waitForTimeout(5000);

  const ALL_PROGRAMS = [
    "M10N_PROGRAM_UNSPECIFIED", "M10N_PROGRAM_VIDEO_GIFTS", "M10N_PROGRAM_TIPS",
    "M10N_PROGRAM_CREATOR_NEXT", "M10N_PROGRAM_CREATOR_FUND", "M10N_PROGRAM_TIKTOK_CREATOR_MARKETPLACE",
    "M10N_PROGRAM_SHOUTOUTS", "M10N_PROGRAM_LIVE_GIFTS", "M10N_PROGRAM_TIKTOK_SHOP",
    "M10N_PROGRAM_CREATOR_INCENTIVES", "M10N_PROGRAM_SERIES", "M10N_PROGRAM_TIKTOK_SHOP_MERCHANT",
    "M10N_PROGRAM_MUSIC_PROMOTION", "M10N_PROGRAM_LIVE_SUBSCRIPTION", "M10N_PROGRAM_TIKTOK_CREATIVE_CHALLENGE",
    "M10N_PROGRAM_TIKTOK_GAMING_REWARD", "M10N_PROGRAM_TIKTOK_BRANDED_MISSION", "M10N_PROGRAM_TIKTOK_LOCAL_SERVICE",
    "M10N_PROGRAM_GO_LIVE_INCENTIVE", "M10N_PROGRAM_GO_LIVE_LEADS", "M10N_PROGRAM_SOUNDON", "M10N_PROGRAM_GO_LIVE_SMB",
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21
  ];

  const result = await page.evaluate(async (allPrograms) => {
    const perfUrls = performance.getEntriesByType("resource")
      .map(e => e.name)
      .filter(u => u.includes("reward_analytics_per_post"));
    
    if (!perfUrls.length) return { error: "No perfUrls" };

    const base = new URL(perfUrls[0]);
    // Modify filter to include all programs and all-time range
    const filter = {
      video_analytics_display_time_range: 1,
      video_analytics_sort_by_type: 3,
      video_analytics_programs: allPrograms,
    };
    base.searchParams.set("video_analytics_filter", JSON.stringify(filter));

    const allVideos = [];
    let p = 0;
    let keepGoing = true;

    while (keepGoing && p < 20) {
      base.searchParams.set("page", String(p));
      const res = await fetch(base.toString(), { credentials: "include" });
      const json = await res.json();
      const list = json?.data?.video_analytics_video_list || json?.video_analytics_video_list || [];
      allVideos.push(...list);
      keepGoing = !!(json?.data?.has_more || json?.has_more);
      if (!list.length) break;
      p++;
    }

    return {
      totalFetched: allVideos.length,
      pages: p,
      allVideos: allVideos.map(v => ({
        id: v.video_id_str || String(v.video_id),
        title: v.video_name,
        reward: v.est_rewards?.formatted_no_symbol || "0.00",
        date: v.publish_date_unix_time ? new Date(v.publish_date_unix_time * 1000).toISOString().split("T")[0] : null
      }))
    };
  }, ALL_PROGRAMS);

  console.log("Result total fetched:", result.totalFetched);
  console.log("Result pages:", result.pages);
  if (result.allVideos) {
    const uniqueIds = new Set(result.allVideos.map(v => v.id));
    console.log("Unique videos count:", uniqueIds.size);
    const withReward = result.allVideos.filter(v => parseFloat(v.reward) > 0);
    console.log("Videos with reward > 0:", withReward.length);
    const sum = withReward.reduce((s, v) => s + parseFloat(v.reward), 0);
    console.log("Total accumulated rewards:", sum.toFixed(2));
    const dates = result.allVideos.map(v => v.date).filter(Boolean).sort();
    console.log("Oldest video date:", dates[0]);
    console.log("Newest video date:", dates[dates.length - 1]);
  }

  await context.close();
  try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
}

main().catch(console.error);
