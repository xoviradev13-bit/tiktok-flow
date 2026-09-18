import { chromium } from "playwright";
import { gpmClient } from "../src/lib/gpm-api";

async function main() {
  const profileId = "500a1071-8dd2-43dd-9685-220721b0c4a4";
  console.log(`Calling gpmClient.startProfile for ${profileId}...`);
  const startResult = await gpmClient.startProfile(profileId, { skipProxyCheck: true });
  console.log("Start Result:", startResult);

  if (!startResult?.remote_debugging_port) {
    console.log("No debugging port returned. Trying websocket URL:", startResult?.websocket_debugging_url);
  }

  const endpoint = startResult?.websocket_debugging_url || (startResult?.remote_debugging_port ? `http://127.0.0.1:${startResult.remote_debugging_port}` : null);
  if (!endpoint) {
    console.log("Cannot connect via CDP.");
    process.exit(1);
  }

  console.log(`Connecting via CDP: ${endpoint}`);
  const browser = await chromium.connectOverCDP(endpoint);
  const context = browser.contexts()[0] || (await browser.newContext());
  const pages = context.pages();
  console.log(`Connected! Open tabs: ${pages.length}`);
  for (let i = 0; i < pages.length; i++) {
    console.log(`  Tab ${i + 1}: ${pages[i].url()}`);
  }

  let studioPage = pages.find(p => p.url().includes("tiktokstudio"));
  if (!studioPage) {
    studioPage = pages[0] || (await context.newPage());
    await studioPage.goto("https://www.tiktok.com/tiktokstudio/monetization", { waitUntil: "domcontentloaded", timeout: 20000 });
  }

  console.log(`Using page: ${studioPage.url()}`);
  console.log("Calling internal API /tiktok/v1/creator/m10n_center/reward_analytics_per_post?page=0 in-session...");

  const result = await studioPage.evaluate(async () => {
    try {
      const res = await fetch("/tiktok/v1/creator/m10n_center/reward_analytics_per_post?page=0", {
        credentials: "include",
      });
      return await res.json();
    } catch (e: any) {
      return { error: e.message };
    }
  });

  console.log("\n--- Full reward_analytics_per_post API Response ---");
  console.log(JSON.stringify(result, null, 2));

  // If item URL is open, also fetch video_reward_analytics for 7672354204966456598
  const videoId = "7672354204966456598";
  console.log(`\nCalling internal API /tiktok/v1/creator/m10n_center/video_reward_analytics?video_id=${videoId}...`);
  const itemResult = await studioPage.evaluate(async (vid) => {
    try {
      const res = await fetch(`/tiktok/v1/creator/m10n_center/video_reward_analytics?video_id=${vid}`, {
        credentials: "include",
      });
      return await res.json();
    } catch (e: any) {
      return { error: e.message };
    }
  }, videoId);

  console.log("\n--- Full video_reward_analytics API Response ---");
  console.log(JSON.stringify(itemResult, null, 2));

  process.exit(0);
}

main().catch(err => {
  console.error("Error:", err.message);
  process.exit(1);
});
