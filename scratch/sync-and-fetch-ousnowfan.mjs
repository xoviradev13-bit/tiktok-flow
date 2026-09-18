import { chromium } from "playwright-core";

const PROFILE_ID = "500a1071-8dd2-43dd-9685-220721b0c4a4";
const GPM_BASE = "http://127.0.0.1:9495/api/v1";

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log(`[1] Stopping profile ${PROFILE_ID} to ensure fresh CDP session...`);
  try {
    const stopRes = await fetch(`${GPM_BASE}/profiles/stop/${PROFILE_ID}`);
    console.log("Stop response:", await stopRes.json());
  } catch (e) {
    console.warn("Stop warning:", e.message);
  }

  await sleep(2500);

  console.log(`[2] Starting profile ${PROFILE_ID} via GPM API...`);
  const startRes = await fetch(`${GPM_BASE}/profiles/start/${PROFILE_ID}?skip_proxy_check=true`);
  const startJson = await startRes.json();
  console.log("Start response:", startJson);

  const port = startJson?.data?.remote_debugging_port;
  if (!port) {
    console.error("No remote debugging port returned!");
    process.exit(1);
  }

  console.log(`[3] Waiting for CDP to be ready on port ${port}...`);
  let cdpReady = false;
  for (let i = 0; i < 15; i++) {
    try {
      const v = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (v.ok) {
        cdpReady = true;
        console.log("CDP ready:", await v.json());
        break;
      }
    } catch { }
    await sleep(1000);
  }

  if (!cdpReady) {
    console.error("CDP failed to become ready in time.");
    process.exit(1);
  }

  console.log(`[4] Connecting Playwright over CDP to http://127.0.0.1:${port}...`);
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const context = browser.contexts()[0] || (await browser.newContext());
  const pages = context.pages();
  console.log(`Connected! Current pages count: ${pages.length}`);

  for (let i = 0; i < pages.length; i++) {
    console.log(`  Tab ${i + 1}: ${pages[i].url()}`);
  }

  let studioPage = pages.find((p) => p.url().includes("tiktokstudio"));
  if (!studioPage) {
    studioPage = pages[0] || (await context.newPage());
    console.log("Navigating to https://www.tiktok.com/tiktokstudio/monetization ...");
    await studioPage.goto("https://www.tiktok.com/tiktokstudio/monetization", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
  }

  console.log(`Using page: ${studioPage.url()}`);
  await sleep(3000); // allow hydration

  console.log("[5] Fetching reward_analytics_per_post from inside the page...");
  const perPostResult = await studioPage.evaluate(async () => {
    try {
      const res = await fetch("/tiktok/v1/creator/m10n_center/reward_analytics_per_post?page=0", {
        credentials: "include",
      });
      return await res.json();
    } catch (e) {
      return { error: e.message };
    }
  });

  console.log("\n=================== PER POST REWARDS DATA ===================");
  console.log(JSON.stringify(perPostResult, null, 2));

  // Also fetch page 1 if there's has_more
  if (perPostResult?.data?.has_more || perPostResult?.has_more) {
    console.log("\n[5b] Fetching page 1...");
    const page1 = await studioPage.evaluate(async () => {
      try {
        const res = await fetch("/tiktok/v1/creator/m10n_center/reward_analytics_per_post?page=1", {
          credentials: "include",
        });
        return await res.json();
      } catch (e) {
        return { error: e.message };
      }
    });
    console.log("Page 1 result:", JSON.stringify(page1, null, 2));
  }

  // Also fetch general reward_analytics
  console.log("\n[6] Fetching /m10n_center/reward_analytics...");
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
  console.log("General Reward Analytics:", JSON.stringify(generalM10n, null, 2));

  // If there are videos in perPostResult, fetch video_reward_analytics for the top one
  const videoList =
    perPostResult?.data?.video_analytics_video_list ||
    perPostResult?.video_analytics_video_list ||
    [];

  if (videoList.length > 0) {
    const firstVid = videoList[0]?.video_id_str || videoList[0]?.video_id;
    console.log(`\n[7] Fetching detailed video_reward_analytics for first video ${firstVid}...`);
    const itemAnalytics = await studioPage.evaluate(async (vid) => {
      try {
        const res = await fetch(`/tiktok/v1/creator/m10n_center/video_reward_analytics?video_id=${vid}`, {
          credentials: "include",
        });
        return await res.json();
      } catch (e) {
        return { error: e.message };
      }
    }, firstVid);
    console.log(`Video ${firstVid} details:`, JSON.stringify(itemAnalytics, null, 2));
  }

  console.log("\n[OK] Completed successfully! Disconnecting CDP (leaving browser open for user)...");
  await browser.close();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
