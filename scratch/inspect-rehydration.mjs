import path from "path";
import fs from "fs";
import { chromium } from "playwright-core";
import {
  getGpmStoragePath,
  getChromeExecutablePath,
  createMinimalProfileSnapshot,
} from "../client-agent/agent.js";

async function inspectProfileScript() {
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

  console.log("Navigating to https://www.tiktok.com/@ousnowfan ...");
  await page.goto("https://www.tiktok.com/@ousnowfan", { waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(3000);

  const scriptData = await page.evaluate(() => {
    const el = document.getElementById("__UNIVERSAL_DATA_FOR_REHYDRATION__");
    if (!el) return null;
    try {
      const j = JSON.parse(el.textContent);
      const userModule = j["__DEFAULT_SCOPE__"]?.["webapp.user-detail"]?.userInfo;
      return userModule || j;
    } catch (e) {
      return { error: e.message };
    }
  });

  console.log("User stats:", JSON.stringify(scriptData?.stats || scriptData?.user?.stats || scriptData, null, 2).slice(0, 1000));

  await context.close();
  try { fs.rmSync(snap.tempDir, { recursive: true, force: true }); } catch {}
}

inspectProfileScript().catch(console.error);
