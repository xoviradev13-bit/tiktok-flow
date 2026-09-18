import path from "path";
import fs from "fs";
import { chromium } from "playwright-core";
import {
  getGpmStoragePath,
  getChromeExecutablePath,
  createMinimalProfileSnapshot,
} from "../client-agent/agent.js";

async function inspectM10nApis() {
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

  await page.goto("https://www.tiktok.com/tiktokstudio/monetization", { waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(4000);

  // Direct fetch various time ranges for reward_analytics
  const analyticsData = await page.evaluate(async () => {
    const res = {};
    for (const range of ["7d", "30d", "60d", "all", "all_time"]) {
      try {
        const r = await fetch(`/tiktok/v1/creator/m10n_center/reward_analytics?range=${range}`, { credentials: "include" });
        res[range] = await r.json();
      } catch (e) {
        res[range] = e.message;
      }
    }
    // Check overview insights on Home (insight_type 126, 127 etc)
    for (const range of [1, 2, 3, 4]) {
      try {
        const typeReq = [{ insight_type: 126, data_date_range: range }];
        const r = await fetch(`/tiktok/v1/analytics/insights/?type_requests=${encodeURIComponent(JSON.stringify(typeReq))}&time_offset=25200`, { credentials: "include" });
        res["insight_126_range_" + range] = await r.json();
      } catch (e) {}
    }
    return res;
  });

  fs.writeFileSync("scratch/m10n_detailed_inspection.json", JSON.stringify(analyticsData, null, 2), "utf8");
  console.log("Saved m10n detailed inspection");

  await context.close();
  try { fs.rmSync(snap.tempDir, { recursive: true, force: true }); } catch {}
}

inspectM10nApis().catch(console.error);
