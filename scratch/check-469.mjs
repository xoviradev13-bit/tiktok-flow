import path from "path";
import fs from "fs";
import { chromium } from "playwright-core";
import {
  getGpmStoragePath,
  getChromeExecutablePath,
  createMinimalProfileSnapshot,
} from "../client-agent/agent.js";

async function check469() {
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
  await page.goto("https://www.tiktok.com/tiktokstudio/content", { waitUntil: "domcontentloaded", timeout: 20000 });
  await page.waitForTimeout(4000);

  const data = await page.evaluate(() => {
    const el = document.getElementById("__Creator_Center_Context__");
    let ctx = {};
    if (el) {
      try { ctx = JSON.parse(el.textContent); } catch {}
    }
    // Search all numbers on content page
    const text = document.body?.innerText || "";
    const matches469 = text.includes("469");
    const numbers = text.match(/\b\d+\b/g) || [];
    return {
      has469: matches469,
      firstBatchCount: ctx.firstBatchQueryItems?.item_list?.length,
      firstBatchTotal: ctx.firstBatchQueryItems?.total,
      firstBatchHasMore: ctx.firstBatchQueryItems?.has_more,
      pagination: ctx.firstBatchQueryItems?.pagination,
      ctxKeys: Object.keys(ctx),
      textSnippet: text.slice(0, 1500),
    };
  });

  console.log("Content check:", data);

  await context.close();
  try { fs.rmSync(snap.tempDir, { recursive: true, force: true }); } catch {}
}

check469().catch(console.error);
