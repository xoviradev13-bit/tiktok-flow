import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { chromium } from "playwright-core";

const PROFILE_ID = "500a1071-8dd2-43dd-9685-220721b0c4a4";
const GPM_BASE = "http://127.0.0.1:9495/api/v1";

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  console.log("=== STEP 1: Gracefully killing any orphaned or port-less Chrome instance for Profile 2492 ===");
  try {
    const out = execSync("powershell -Command \"Get-Process chrome | Select-Object Id\"", { encoding: "utf8" });
    const pids = out.trim().split("\n").map(l => l.trim()).filter(l => /^\d+$/.test(l));
    for (const pid of pids) {
      try {
        const cmd = execSync(`powershell -Command "(Get-CimInstance Win32_Process -Filter 'ProcessId = ${pid}').CommandLine"`, { encoding: "utf8" }).trim();
        if (cmd.includes(PROFILE_ID) && !cmd.includes("--type=")) {
          console.log(`Killing main browser process PID ${pid}...`);
          try {
            execSync(`taskkill /PID ${pid} /T /F`);
          } catch (e) {
            console.log(`Process ${pid} exit:`, e.message);
          }
        }
      } catch {}
    }
  } catch (err) {
    console.warn("Kill step warning:", err.message);
  }

  await sleep(3000);

  console.log("=== STEP 2: Launching Profile 2492 via GPM API with remote debugging ===");
  const startRes = await fetch(`${GPM_BASE}/profiles/start/${PROFILE_ID}?skip_proxy_check=true`);
  const startJson = await startRes.json();
  console.log("Start response:", JSON.stringify(startJson, null, 2));

  const port = startJson?.data?.remote_debugging_port;
  if (!port) {
    throw new Error("Failed to get remote_debugging_port from GPM API");
  }

  console.log(`=== STEP 3: Waiting for CDP ready on port ${port} ===`);
  let cdpReady = false;
  for (let i = 0; i < 20; i++) {
    try {
      const v = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (v.ok) {
        cdpReady = true;
        console.log("CDP connected:", await v.json());
        break;
      }
    } catch {}
    await sleep(1000);
  }

  if (!cdpReady) {
    throw new Error("CDP port not responding");
  }

  console.log("=== STEP 4: Connecting Playwright over CDP ===");
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const context = browser.contexts()[0];
  const pages = context.pages();
  console.log(`Current open tabs: ${pages.length}`);
  pages.forEach((p, idx) => console.log(`  Tab ${idx + 1}: ${p.url()}`));

  let studioPage = pages.find(p => p.url().includes("tiktokstudio"));
  if (!studioPage) {
    studioPage = pages[0] || (await context.newPage());
    console.log("Navigating to https://www.tiktok.com/tiktokstudio/monetization ...");
    await studioPage.goto("https://www.tiktok.com/tiktokstudio/monetization", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
  }

  console.log(`Active page URL: ${studioPage.url()}`);
  await sleep(3500);

  console.log("=== STEP 5: Intercepting & Calling TikTok Studio Reward APIs ===");

  // 1. reward_analytics_per_post
  let allRewardPosts = [];
  let pageIndex = 0;
  let hasMore = true;

  while (hasMore && pageIndex < 10) {
    console.log(`Fetching reward_analytics_per_post?page=${pageIndex}...`);
    const pageData = await studioPage.evaluate(async (p) => {
      try {
        const res = await fetch(`/tiktok/v1/creator/m10n_center/reward_analytics_per_post?page=${p}`, {
          credentials: "include",
        });
        return await res.json();
      } catch (e) {
        return { error: e.message };
      }
    }, pageIndex);

    const payload = pageData.data || pageData;
    const list = payload.video_analytics_video_list || [];
    console.log(`  Page ${pageIndex}: retrieved ${list.length} posts.`);
    if (list.length > 0) {
      allRewardPosts.push(...list);
    }
    hasMore = !!payload.has_more;
    pageIndex++;
    if (!list.length) break;
  }

  // 2. reward_analytics (overview / total)
  console.log("Fetching /tiktok/v1/creator/m10n_center/reward_analytics...");
  const generalM10n = await studioPage.evaluate(async () => {
    try {
      const res = await fetch("/tiktok/v1/creator/m10n_center/reward_analytics", {
        credentials: "include",
      });
      return await res.json();
    } catch (e) {
      return { error: e.message };
    }
  });

  // 3. all_programs
  console.log("Fetching /tiktok/v1/creator/m10n_center/all_programs...");
  const allPrograms = await studioPage.evaluate(async () => {
    try {
      const res = await fetch("/tiktok/v1/creator/m10n_center/all_programs", {
        credentials: "include",
      });
      return await res.json();
    } catch (e) {
      return { error: e.message };
    }
  });

  // 4. video_reward_analytics for each reward post
  console.log(`Fetching detailed video_reward_analytics for ${allRewardPosts.length} posts...`);
  const detailedPosts = [];
  for (const post of allRewardPosts) {
    const vid = post.video_id_str || post.video_id;
    let detail = null;
    if (vid) {
      detail = await studioPage.evaluate(async (videoId) => {
        try {
          const res = await fetch(`/tiktok/v1/creator/m10n_center/video_reward_analytics?video_id=${videoId}`, {
            credentials: "include",
          });
          return await res.json();
        } catch (e) {
          return null;
        }
      }, vid);
    }
    detailedPosts.push({
      postSummary: post,
      detail: detail?.data || detail,
    });
    await sleep(200);
  }

  const finalOutput = {
    account: "ousnowfan",
    profileId: PROFILE_ID,
    fetchedAt: new Date().toISOString(),
    totalRewardPosts: allRewardPosts.length,
    rewardAnalyticsOverview: generalM10n?.data || generalM10n,
    allPrograms: allPrograms?.data || allPrograms,
    posts: detailedPosts,
  };

  const outFile = path.resolve("scratch/ousnowfan_full_rewards.json");
  fs.writeFileSync(outFile, JSON.stringify(finalOutput, null, 2), "utf8");
  console.log(`\n[OK] Successfully saved full dataset to: ${outFile}`);

  // Database update will be done via dedicated script from JSON


  console.log("\n================ FULL REWARDPOSTS SUMMARY ================");
  console.log(`Account: @ousnowfan`);
  console.log(`Total Rewarded Videos: ${allRewardPosts.length}`);
  allRewardPosts.forEach((p, idx) => {
    const pubDate = p.publish_date_unix_time ? new Date(Number(p.publish_date_unix_time) * 1000).toLocaleDateString("en-GB") : "N/A";
    console.log(
      `#${idx + 1} ID: ${p.video_id_str || p.video_id} | ` +
      `Title: "${p.video_name}" | ` +
      `Est Rewards: £${p.est_rewards} | ` +
      `RPM: £${p.rpm_metadata?.value || 0} | ` +
      `Qualified Views: ${Number(p.quvv).toLocaleString()} | ` +
      `Published: ${pubDate} | Duration: ${p.video_duration}s`
    );
  });

  // Disconnect CDP but DO NOT close the browser, so the user's GPM window remains open!
  console.log("\n[OK] Disconnecting CDP session (browser window stays open for user).");
  process.exit(0);
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
