import path from "path";
import fs from "fs";
import { chromium } from "playwright-core";
import {
  getGpmStoragePath,
  getChromeExecutablePath,
  createMinimalProfileSnapshot,
} from "../client-agent/agent.js";

async function testFetch() {
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
  await page.goto("https://www.tiktok.com/tiktokstudio", { waitUntil: "domcontentloaded", timeout: 20000 });

  const stats = await page.evaluate(async (handle) => {
    try {
      const res = await fetch(`https://www.tiktok.com/@${handle}`, { credentials: "include" });
      const html = await res.text();
      const match = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/);
      if (match) {
        const parsed = JSON.parse(match[1]);
        const userStats = parsed["__DEFAULT_SCOPE__"]?.["webapp.user-detail"]?.userInfo?.stats;
        return userStats || null;
      }
    } catch (e) {
      return { error: e.message };
    }
    return null;
  }, "ousnowfan");

  console.log("In-page fetch stats for @ousnowfan:", stats);

  await context.close();
  try { fs.rmSync(snap.tempDir, { recursive: true, force: true }); } catch {}
}

testFetch().catch(console.error);
