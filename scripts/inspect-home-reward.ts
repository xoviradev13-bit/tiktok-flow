import fs from "fs";
import path from "path";
import os from "os";
import { chromium } from "playwright";
import { getChromeExecutablePath } from "../src/lib/tiktok-extractor";

async function inspectHomeRewardAnalytics() {
  const sourceProfile = "D:\\Tiktok automation\\b57d9f1b-4dae-4377-a870-99d5b8be8434";
  const tempProfile = path.join(os.tmpdir(), "gpm_inspect_home_m10n_" + Date.now());
  fs.mkdirSync(path.join(tempProfile, "Default"), { recursive: true });

  const filesToCopy = [
    "Local State",
    "Default/Preferences",
    "Default/Secure Preferences",
    "Default/Network",
    "Default/Local Storage",
    "Default/Sessions",
    "Default/Cookies",
  ];

  for (const item of filesToCopy) {
    const src = path.join(sourceProfile, item);
    const dst = path.join(tempProfile, item);
    try {
      if (fs.existsSync(src)) {
        fs.cpSync(src, dst, { recursive: true, force: true, errorOnExist: false });
      }
    } catch (e) {}
  }

  const chromePath = getChromeExecutablePath();
  const context = await chromium.launchPersistentContext(tempProfile, {
    executablePath: chromePath,
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-blink-features=AutomationControlled",
      "--lang=en-US",
    ],
    viewport: { width: 1440, height: 900 },
  });

  const page = context.pages()[0] || (await context.newPage());

  let rewardAnalyticsData = null;
  let rewardAnalyticsUrl = "";
  const allHomeApis: Record<string, any> = {};

  page.on("response", async (resp) => {
    const url = resp.url();
    if (url.includes("reward_analytics")) {
      rewardAnalyticsUrl = url;
      try {
        rewardAnalyticsData = await resp.json();
      } catch (e) {}
    } else if (url.includes("/api/") || url.includes("/v1/creator/") || url.includes("/aweme/")) {
      try {
        const text = await resp.text();
        const base = url.split("?")[0];
        if (text.includes("reward") || text.includes("income") || text.includes("metric") || text.includes("overview")) {
          allHomeApis[base] = text.substring(0, 300);
        }
      } catch {}
    }
  });

  console.log("Navigating to Home: https://www.tiktok.com/tiktokstudio ...");
  await page.goto("https://www.tiktok.com/tiktokstudio", {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  }).catch(() => {});

  await page.waitForTimeout(6000);

  console.log("--- REWARD ANALYTICS FULL URL ---");
  console.log(rewardAnalyticsUrl);
  console.log("--- REWARD ANALYTICS FULL JSON ---");
  console.log(JSON.stringify(rewardAnalyticsData, null, 2));
  console.log("--- ALL HOME MATCHING APIS ---");
  console.log(JSON.stringify(allHomeApis, null, 2));

  await context.close();
  try { fs.rmSync(tempProfile, { recursive: true, force: true }); } catch (e) {}
}

inspectHomeRewardAnalytics().catch(console.error);
