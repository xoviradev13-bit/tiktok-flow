import { chromium } from "playwright-core";
import fs from "fs";

const PROFILE_ID = "500a1071-8dd2-43dd-9685-220721b0c4a4";
const GPM_BASE = "http://127.0.0.1:9495/api/v1";

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  console.log("Checking if GPM profile is already running with remote debugging port...");
  const startRes = await fetch(`${GPM_BASE}/profiles/start/${PROFILE_ID}?skip_proxy_check=true`);
  const startJson = await startRes.json();
  const port = startJson?.data?.remote_debugging_port;

  if (!port) {
    console.error("Could not get port:", startJson);
    process.exit(1);
  }

  console.log(`Connecting to port ${port}...`);
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const context = browser.contexts()[0];
  const page = context.pages()[0] || (await context.newPage());

  const intercepted = [];

  page.on("response", async (resp) => {
    const url = resp.url();
    if (
      url.includes("reward_analytics") ||
      url.includes("m10n") ||
      url.includes("creator_rewards") ||
      url.includes("video_reward") ||
      url.includes("item_list")
    ) {
      try {
        const text = await resp.text();
        const json = JSON.parse(text);
        intercepted.push({
          url,
          status: resp.status(),
          data: json,
        });
        console.log(`[CAPTURED] ${resp.status()} ${url.split("?")[0]}`);
      } catch (e) {
        // not json
      }
    }
  });

  const targetUrl = "https://www.tiktok.com/tiktokstudio/monetization/item/7672354204966456598/";
  console.log(`Navigating to ${targetUrl}...`);
  await page.goto(targetUrl, { waitUntil: "networkidle", timeout: 30000 }).catch(err => {
    console.log("Navigation timeout or finished with:", err.message);
  });

  console.log("Waiting 5s for any delayed requests...");
  await sleep(5000);

  console.log(`Total intercepted responses: ${intercepted.length}`);
  fs.writeFileSync("scratch/intercepted_target.json", JSON.stringify(intercepted, null, 2), "utf8");

  for (const item of intercepted) {
    console.log("\n--------------------------------------------------");
    console.log("URL:", item.url);
    console.log("DATA:", JSON.stringify(item.data, null, 2).slice(0, 1500));
  }

  process.exit(0);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
